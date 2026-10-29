import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { MovementDirection, MovementStatus } from 'mintly-lib';
import {
  FluxoCaixaService,
  isoFromOffset,
  offsetFromIso,
  formatDia,
  formatDiaLongo,
  MAX_HORIZONTE_DIAS,
} from '../../services/fluxo-caixa.service';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { AreaChartComponent, AreaSeries, AreaDot } from '../../shared/area-chart.component';
import { BarChartComponent, BarSeries } from '../../shared/bar-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL } from '../../shared/format';

const HORIZONS = [30, 60, 90];
const abrev = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? '-' : ''}${Math.round(abs / 100) / 10}k`;
  return String(Math.round(v));
};

type Tab = 'todos' | 'receber' | 'pagar' | 'vencidos';

/** Shape local pra tela — adaptado do `DueItem` real (mesmo vocabulário em PT que a tela já usava). */
interface VencimentoView {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'receber' | 'pagar';
  dataVencimento: string;
  status: 'previsto' | 'pago' | 'recebido' | 'vencido';
  categoria: string;
  offset: number;
}

const EMPTY_STATE: Record<Tab, { icon: string; title: string; description: string }> = {
  todos: {
    icon: 'event_available',
    title: 'Nenhum vencimento por aqui',
    description: 'Não há lançamentos com vencimento dentro do horizonte selecionado.',
  },
  receber: {
    icon: 'south_west',
    title: 'Nada a receber neste período',
    description: 'Nenhuma entrada prevista dentro do horizonte selecionado.',
  },
  pagar: {
    icon: 'north_east',
    title: 'Nada a pagar neste período',
    description: 'Nenhuma saída prevista dentro do horizonte selecionado.',
  },
  vencidos: {
    icon: 'task_alt',
    title: 'Nenhuma conta vencida',
    description: 'Tudo em dia — não há vencimentos atrasados.',
  },
};

const STATUS_META: Record<
  VencimentoView['status'],
  { label: string; icon: string; tone: 'neutral' | 'success' | 'warning' | 'error' | 'ocean' }
> = {
  previsto: { label: 'Previsto', icon: 'schedule', tone: 'ocean' },
  pago: { label: 'Pago', icon: 'check_circle', tone: 'success' },
  recebido: { label: 'Recebido', icon: 'check_circle', tone: 'success' },
  vencido: { label: 'Vencido', icon: 'error', tone: 'error' },
};

@Component({
  selector: 'app-fluxo-caixa',
  standalone: true,
  imports: [
    IconComponent,
    ChipComponent,
    HintComponent,
    StatCardComponent,
    ChartCardComponent,
    InsightCardComponent,
    SectionHeaderComponent,
    EmptyStateComponent,
    AreaChartComponent,
    BarChartComponent,
  ],
  templateUrl: './fluxo-caixa.component.html',
})
export class FluxoCaixaComponent implements OnInit {
  private svc = inject(FluxoCaixaService);
  private auth = inject(AuthService);
  protected empresa = computed(() => this.auth.currentUser()?.empresa?.trim() ?? '');
  private toast = inject(ToastService);

  protected horizons = HORIZONS;
  protected horizon = signal(30);
  protected customOpen = signal(false);
  protected customDate = signal('');
  protected customError = signal('');
  protected customAplicado = signal<string | null>(null);
  protected tab = signal<Tab>('todos');
  protected tabOpts: { key: Tab; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'receber', label: 'A receber' },
    { key: 'pagar', label: 'A pagar' },
    { key: 'vencidos', label: 'Vencidos' },
  ];

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected abrev = abrev;
  protected formatDia = formatDia;
  protected formatDiaLongo = formatDiaLongo;
  protected statusMeta = STATUS_META;
  protected emptyState = EMPTY_STATE;

  protected areaSeries: AreaSeries[] = [
    { key: 'real', name: 'Saldo realizado', color: 'var(--ocean)', fill: true },
    { key: 'futuro', name: 'Saldo previsto', color: 'var(--ocean)', dashed: true, fill: true },
  ];
  protected blocosSeries: BarSeries[] = [
    { key: 'entradas', name: 'Entradas', color: 'var(--mint)' },
    { key: 'saidas', name: 'Saídas', color: 'var(--warning)' },
  ];

  protected label = computed(() => {
    const custom = this.customAplicado();
    return custom ? `até ${formatDia(custom)}` : `${this.horizon()} dias`;
  });

  protected hoje = computed(() => this.data()?.today ?? isoFromOffset(0));
  protected hojeRotulo = computed(() => formatDia(this.hoje()));
  protected minCustomDate = isoFromOffset(1);
  protected maxCustomDate = isoFromOffset(MAX_HORIZONTE_DIAS);

  /** Primeiro dia (se houver) em que o saldo projetado cai abaixo da margem de segurança. */
  protected criticalInsight = computed(() => {
    const d = this.data();
    return d?.insights.find((i) => i.kind === 'criticalDay');
  });
  protected alerta = computed(() => !!this.criticalInsight());
  protected diaAperto = computed(() => {
    const c = this.criticalInsight();
    return c ? offsetFromIso(c.date) : 0;
  });
  protected menorSaldoOffset = computed(() => {
    const d = this.data();
    return d ? offsetFromIso(d.lowestBalance.date) : 0;
  });
  /** Menor saldo só tem sentido em um dia futuro; no dia 0 o caixa não cai abaixo de hoje. */
  protected menorSaldoTexto = computed(() => {
    const d = this.data();
    if (!d || this.menorSaldoOffset() <= 0) return 'sem queda prevista no período';
    return (
      'menor saldo: ~' + formatBRL(d.lowestBalance.balance) + ' no dia ' + this.menorSaldoOffset()
    );
  });

  protected serie = computed(() => {
    const d = this.data();
    if (!d) return [];
    const passado = d.realized.map((p) => ({
      rotulo: formatDia(p.date),
      real: p.balance,
      futuro: null as number | null,
    }));
    const futuro = d.projection.map((p, i) => ({
      rotulo: formatDia(p.date),
      real: i === 0 ? p.balance : (null as number | null),
      futuro: p.balance,
    }));
    return [...passado, ...futuro];
  });

  protected dots = computed<AreaDot[]>(() => {
    const d = this.data();
    const c = this.criticalInsight();
    if (!d) return [];
    const base: AreaDot[] = [{ atLabel: this.hojeRotulo(), key: 'real', color: 'var(--ocean)' }];
    if (c) {
      base.push({
        atLabel: formatDia(c.date),
        key: 'futuro',
        color: 'var(--warning)',
        caption: `menor saldo ~${formatBRL(c.balance)} · dia ${offsetFromIso(c.date)}`,
      });
    }
    return base;
  });

  /** `weeks` real (from/to) reempacotado no shape que o gráfico de barras já usava (semana/período). */
  protected blocos = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.weeks.map((w, i) => ({
      semana: `Sem ${i + 1}`,
      periodo: `${formatDia(w.from)} – ${formatDia(w.to)}`,
      entradas: w.inflows,
      saidas: w.outflows,
    }));
  });

  /** Sparks curtos (não vêm mais do back) — últimos pontos realizados + previstos. */
  protected sparkReceber = computed(() => {
    const d = this.data();
    if (!d) return [];
    return [...d.realized.map((p) => p.inflows), ...d.projection.slice(1, 5).map((p) => p.inflows)];
  });
  protected sparkPagar = computed(() => {
    const d = this.data();
    if (!d) return [];
    return [
      ...d.realized.map((p) => p.outflows),
      ...d.projection.slice(1, 5).map((p) => p.outflows),
    ];
  });

  protected itens = computed<VencimentoView[]>(() => {
    const d = this.data();
    if (!d) return [];
    const tab = this.tab();
    const views: VencimentoView[] = d.dueItems.map((v) => {
      const tipo = v.direction === MovementDirection.In ? 'receber' : 'pagar';
      const status: VencimentoView['status'] = v.overdue
        ? 'vencido'
        : v.status === MovementStatus.Settled
          ? tipo === 'receber'
            ? 'recebido'
            : 'pago'
          : 'previsto';
      return {
        id: v.id,
        descricao: v.title,
        valor: v.amount,
        tipo,
        dataVencimento: v.dueDate,
        status,
        categoria: v.category.name,
        offset: offsetFromIso(v.dueDate),
      };
    });
    return views
      .filter((v) => {
        if (tab === 'vencidos') return v.status === 'vencido';
        if (tab === 'todos')
          return v.status !== 'pago' && v.status !== 'recebido' ? true : v.offset >= -7;
        return v.tipo === tab && v.status !== 'pago' && v.status !== 'recebido';
      })
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
  });

  protected grupos = computed<[string, VencimentoView[]][]>(() => {
    const map = new Map<string, VencimentoView[]>();
    for (const v of this.itens()) {
      const arr = map.get(v.dataVencimento) ?? [];
      arr.push(v);
      map.set(v.dataVencimento, arr);
    }
    return [...map.entries()];
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.svc
      .refresh(this.horizon())
      .catch(() => this.toast.error('Não foi possível carregar o fluxo de caixa.'));
  }

  setHorizon(h: number): void {
    this.horizon.set(h);
    this.customAplicado.set(null);
    this.customOpen.set(false);
    this.customError.set('');
    this.load();
  }

  toggleCustom(): void {
    this.customOpen.update((o) => !o);
  }

  setCustomDate(v: string): void {
    this.customDate.set(v);
    this.customError.set('');
  }

  aplicarCustom(): void {
    if (!this.customDate()) {
      this.customError.set('Escolha uma data futura para projetar.');
      return;
    }
    const off = offsetFromIso(this.customDate());
    if (off <= 0) {
      this.customError.set(
        'Escolha uma data futura — o fluxo de caixa projeta o que ainda vai acontecer.',
      );
      return;
    }
    if (off > MAX_HORIZONTE_DIAS) {
      this.customError.set(
        'Só é possível projetar até 12 meses à frente, pois estimativas muito distantes deixam de ser confiáveis.',
      );
      return;
    }
    this.customError.set('');
    this.customAplicado.set(this.customDate());
    this.horizon.set(off);
    this.customOpen.set(false);
    this.load();
  }

  setTab(t: Tab): void {
    this.tab.set(t);
  }

  scrollToVencimentos(): void {
    document
      .getElementById('fluxo-vencimentos')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  isCritico(off: number): boolean {
    return off === this.diaAperto();
  }

  isAtrasado(lista: VencimentoView[]): boolean {
    return lista.every((v) => v.status === 'vencido');
  }
}
