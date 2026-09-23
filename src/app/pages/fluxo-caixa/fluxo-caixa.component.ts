import { Component, OnInit, signal, computed, inject } from '@angular/core';
import {
  FluxoCaixaService,
  Vencimento,
  isoFromOffset,
  offsetFromIso,
  formatDia,
  formatDiaLongo,
  MAX_HORIZONTE_DIAS,
  LIMITE_ALERTA,
} from '../../services/fluxo-caixa.service';
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
  Vencimento['status'],
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

  protected hojeRotulo = formatDia(isoFromOffset(0));
  protected minCustomDate = isoFromOffset(1);
  protected maxCustomDate = isoFromOffset(MAX_HORIZONTE_DIAS);

  protected serie = computed(() => {
    const d = this.data();
    if (!d) return [];
    const passado = d.serieRealizada.map((p) => ({
      ...p,
      rotulo: formatDia(p.data),
      real: p.saldo,
      futuro: null as number | null,
    }));
    const futuro = d.resumo.serie.map((p) => ({
      ...p,
      rotulo: formatDia(p.data),
      real: p.offset === 0 ? p.saldo : (null as number | null),
      futuro: p.saldo,
    }));
    return [...passado, ...futuro];
  });

  protected menorSaldo = computed(() => this.data()?.resumo.menorSaldo);
  protected diaAperto = computed(() => this.menorSaldo()?.offset ?? 0);
  protected alerta = computed(() => (this.menorSaldo()?.saldo ?? 0) < LIMITE_ALERTA);

  protected dots = computed<AreaDot[]>(() => {
    const m = this.menorSaldo();
    const d = this.data();
    if (!m || !d) return [];
    return [
      { atLabel: this.hojeRotulo, key: 'real', color: 'var(--ocean)' },
      {
        atLabel: formatDia(m.data),
        key: 'futuro',
        color: 'var(--warning)',
        caption: `menor saldo ~${formatBRL(m.saldo)} · dia ${m.offset}`,
      },
    ];
  });

  protected itens = computed<Vencimento[]>(() => {
    const d = this.data();
    if (!d) return [];
    const tab = this.tab();
    return [...d.vencimentos]
      .filter((v) => {
        if (tab === 'vencidos') return v.status === 'vencido';
        if (tab === 'todos')
          return v.status !== 'pago' && v.status !== 'recebido' ? true : v.offset >= -7;
        return v.tipo === tab && v.status !== 'pago' && v.status !== 'recebido';
      })
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
  });

  protected grupos = computed<[string, Vencimento[]][]>(() => {
    const map = new Map<string, Vencimento[]>();
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

  isAtrasado(lista: Vencimento[]): boolean {
    return lista.every((v) => v.status === 'vencido');
  }
}
