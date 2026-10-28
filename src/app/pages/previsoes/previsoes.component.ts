import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  PrevisoesService,
  Horizonte,
  METRICAS,
  ALAVANCAS_ZERO,
  AJUSTES_ZERO,
  Alavancas,
  Cenario,
  LeverKey,
  SimMetric,
  ajustesDe,
  alavancaNoNormal,
  isDefault,
  simular,
} from '../../services/previsoes.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { ButtonComponent } from '../../shared/button.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import { AreaChartComponent, AreaSeries } from '../../shared/area-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL } from '../../shared/format';

const abrev = (v: number) =>
  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));

interface InsightUI {
  id: string;
  sev: 'risco' | 'atencao' | 'oportunidade' | 'positivo';
  icon: string;
  titulo: string;
  frase: string;
  acao: string;
  onAction: () => void;
  regra: string;
}

const SEV_META: Record<string, { text: string; bg: string; ring: string; label: string }> = {
  risco: { text: 'text-error', bg: 'bg-error/10', ring: 'border-error/30', label: 'Risco' },
  atencao: {
    text: 'text-warning',
    bg: 'bg-warning/10',
    ring: 'border-warning/30',
    label: 'Atenção',
  },
  oportunidade: {
    text: 'text-ocean',
    bg: 'bg-ocean-soft',
    ring: 'border-ocean/25',
    label: 'Oportunidade',
  },
  positivo: { text: 'text-success', bg: 'bg-mint-soft', ring: 'border-mint/30', label: 'Positivo' },
};

@Component({
  selector: 'app-previsoes',
  standalone: true,
  imports: [
    RouterLink,
    EmptyStateComponent,
    IconComponent,
    ChipComponent,
    HintComponent,
    ButtonComponent,
    SectionHeaderComponent,
    AreaChartComponent,
  ],
  templateUrl: './previsoes.component.html',
})
export class PrevisoesComponent implements OnInit {
  private svc = inject(PrevisoesService);
  private toast = inject(ToastService);
  private router = inject(Router);
  protected horizonte = signal<Horizonte>(30);
  protected metric = signal<SimMetric>('caixa');
  protected alavancas = signal<Alavancas>(ALAVANCAS_ZERO);
  protected leverAtiva = signal<LeverKey>('volume');

  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected abrev = abrev;
  protected readonly Math = Math;
  protected dados = this.svc.base;
  protected caixaHoje = computed(() => this.dados().caixaHoje);
  protected temDados = computed(() => this.dados().temDados);
  /** Sem venda à vista recente não há ritmo para o simulador escalar. */
  protected semRitmo = computed(
    () => this.dados().receitaDia === 0 && this.dados().custoVarDia === 0,
  );
  protected metricas = METRICAS;
  protected sevMeta = SEV_META;

  protected horizonteOpts: Horizonte[] = [30, 60, 90];
  protected leverOpts: { key: LeverKey; label: string }[] = [
    { key: 'volume', label: 'Vender mais ou menos' },
    { key: 'preco', label: 'Mudar o preço' },
    { key: 'custo', label: 'Custo dos ingredientes' },
    { key: 'cenario', label: 'Mês fraco ou cheio' },
  ];
  protected cenarioOpts: { v: Cenario; label: string; nota: string }[] = [
    { v: 'fraco', label: 'Fraco', nota: 'vende menos' },
    { v: 'normal', label: 'Normal', nota: 'como hoje' },
    { v: 'cheio', label: 'Cheio', nota: 'vende mais' },
  ];

  protected ajustes = computed(() => ajustesDe(this.alavancas(), this.leverAtiva()));
  protected sim = computed(() => simular(this.ajustes(), this.horizonte(), this.dados()));
  protected base = computed(() => simular(AJUSTES_ZERO, this.horizonte(), this.dados()));
  protected alterado = computed(() => !isDefault(this.ajustes()));

  protected lucroMes = computed(() => simular(this.ajustes(), 30, this.dados()).resultado.lucro);
  protected lucroMesBase = computed(() => simular(AJUSTES_ZERO, 30, this.dados()).resultado.lucro);

  protected pontos = computed(() =>
    this.metric() === 'caixa' ? this.sim().pontos : this.sim().pontosLucro,
  );

  protected areaSeries = computed<AreaSeries[]>(() => {
    const series: AreaSeries[] = [];
    if (this.alterado())
      series.push({
        key: 'base',
        name: 'Cenário atual',
        color: 'var(--muted-foreground)',
        dashed: false,
      });
    series.push({ key: 'real', name: 'Realizado', color: 'var(--ocean)' });
    series.push({ key: 'previsto', name: 'Previsto', color: 'var(--mint)', dashed: true });
    return series;
  });

  protected statusTom = computed<'bom' | 'apertado' | 'negativo'>(() => {
    const r = this.sim().resultado;
    if (r.lucro < 0 || r.caixaMinimo < 0) return 'negativo';
    if (r.margem < 5 || r.caixaMinimo < 3000) return 'apertado';
    return 'bom';
  });

  protected statusMeta = computed(() => {
    const conf = {
      bom: {
        titulo: 'Mês saudável',
        icon: 'check_circle',
        text: 'text-success',
        bg: 'bg-mint-soft',
        border: 'border-mint/30',
        wash: 'bg-mint-soft/40',
      },
      apertado: {
        titulo: 'Mês apertado',
        icon: 'warning',
        text: 'text-warning',
        bg: 'bg-warning/10',
        border: 'border-warning/30',
        wash: 'bg-warning/5',
      },
      negativo: {
        titulo: 'Mês no vermelho',
        icon: 'error',
        text: 'text-error',
        bg: 'bg-error/10',
        border: 'border-error/30',
        wash: 'bg-error/5',
      },
    };
    return conf[this.statusTom()];
  });

  protected statusTexto = computed(() => {
    const r = this.sim().resultado;
    const negativo = this.statusTom() === 'negativo';
    const apertado = this.statusTom() === 'apertado';
    const valor = formatBRL(Math.abs(Math.round(r.lucro)));
    const lucroTxt = r.lucro < 0 ? `−${valor}` : valor;
    const caixaTxt = negativo
      ? 'dá pra reverter no simulador'
      : apertado
        ? `caixa aperta no dia ${r.caixaMinimoLabel.slice(0, 2)}`
        : 'caixa tranquilo';
    return { lucroTxt, caixaTxt };
  });

  protected insights = computed<InsightUI[]>(() => {
    const r = this.sim().resultado;
    const caixaBaixo = r.caixaMinimo < 3000;
    const lista: InsightUI[] = [
      {
        id: 'caixa',
        sev: caixaBaixo ? 'risco' : 'positivo',
        icon: caixaBaixo ? 'report' : 'check_circle',
        titulo: caixaBaixo
          ? `Caixa apertado por volta do dia ${r.caixaMinimoLabel.slice(0, 2)}`
          : 'Caixa segue positivo no período',
        frase: `Saldo mais baixo: ${formatBRL(Math.round(r.caixaMinimo))}.`,
        acao: 'Ver fluxo de caixa',
        onAction: () => this.router.navigate(['/fluxo-de-caixa']),
        regra: 'Regra: saldo projetado mínimo abaixo de R$ 3.000 no horizonte selecionado.',
      },
    ];
    if (r.receita > 0 && r.margem < 15) {
      lista.push({
        id: 'preco',
        sev: 'oportunidade',
        icon: 'lightbulb',
        titulo: 'Um reajuste pequeno no preço ajuda',
        frase: 'Veja o mês com os preços 5% maiores.',
        acao: 'Simular isso',
        onAction: () => this.aplicarSugestao('preco', { preco: 5 }),
        regra: 'Regra: margem prevista abaixo de 15% da receita.',
      });
    }
    if (r.receita > 0 && r.custoVariavel / r.receita > 0.4) {
      lista.push({
        id: 'insumos',
        sev: 'atencao',
        icon: 'warning',
        titulo: 'Custos que variam com as vendas pesam na receita',
        frase: 'Veja o mês com esses custos 5% menores.',
        acao: 'Simular isso',
        onAction: () => this.aplicarSugestao('custo', { custo: -5 }),
        regra: 'Regra: custos variáveis acima de 40% da receita prevista.',
      });
    }
    lista.push({
      id: 'volume',
      sev: 'positivo',
      icon: 'trending_up',
      titulo: 'Vender um pouco mais muda o resultado',
      frase: 'Veja o mês com 10% mais vendas.',
      acao: 'Simular isso',
      onAction: () => this.aplicarSugestao('volume', { volume: 10 }),
      regra: 'Regra: simulação de +10% nas vendas sobre o ritmo dos últimos 30 dias.',
    });
    return lista.slice(0, 4);
  });

  ngOnInit(): void {
    this.svc.refresh().catch(() => this.toast.error('Não foi possível carregar as previsões.'));
  }

  setHorizonte(h: Horizonte): void {
    this.horizonte.set(h);
  }

  setMetric(m: SimMetric): void {
    this.metric.set(m);
  }

  setLever(k: LeverKey, patch: Partial<Alavancas>): void {
    this.leverAtiva.set(k);
    this.alavancas.update((a) => ({ ...a, ...patch }));
  }

  aplicarSugestao(k: LeverKey, patch: Partial<Alavancas>): void {
    this.setLever(k, patch);
    document
      .getElementById('previsoes-simulador')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetAtiva(): void {
    const k = this.leverAtiva();
    this.alavancas.update((a) => ({
      ...a,
      ...(k === 'volume'
        ? { volume: 0 }
        : k === 'preco'
          ? { preco: 0 }
          : k === 'custo'
            ? { custo: 0 }
            : { cenario: 'normal' as Cenario }),
    }));
  }

  leverIsDefault(k: LeverKey): boolean {
    return alavancaNoNormal(this.alavancas(), k);
  }

  /** "+10%" / "−5%" / "igual a hoje" — as três alavancas são percentuais sobre o ritmo atual. */
  pctAlavanca(v: number): string {
    return v === 0 ? 'igual a hoje' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%`;
  }

  kpiInfo(
    value: number,
    before: number,
    positivoQuandoSobe = true,
  ): { diff: number; subiu: boolean; bom: boolean } {
    const diff = value - before;
    const subiu = diff >= 0;
    return { diff, subiu, bom: positivoQuandoSobe ? subiu : !subiu };
  }

  pctFmt(v: number): string {
    return `${v.toFixed(1).replace('.', ',')}%`;
  }
}
