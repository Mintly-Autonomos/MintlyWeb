import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DashboardService, OverviewInsight } from '../../services/dashboard.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { ButtonComponent } from '../../shared/button.component';
import { ModalComponent } from '../../shared/modal.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent, InsightSeverity } from '../../shared/insight-card.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import { BulletComponent } from '../../shared/bullet.component';
import { WaterfallChartComponent, WaterfallRow } from '../../shared/waterfall-chart.component';
import { AreaChartComponent, AreaSeries } from '../../shared/area-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL, fmtMonthLong, fmtMonthShort } from '../../shared/format';

type MonthOpt = 'esteMes' | 'mesPassado' | 'personalizado';
const MONTH_OPTS: { key: MonthOpt; label: string }[] = [
  { key: 'esteMes', label: 'Este mês' },
  { key: 'mesPassado', label: 'Mês passado' },
  { key: 'personalizado', label: 'Personalizado' },
];

const abrev = (v: number) => `${Math.round(v / 1000)}k`;
const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const SCORE_META: Record<
  'risk' | 'attention' | 'healthy' | 'noData',
  { color: string; label: string }
> = {
  risk: { color: 'var(--error)', label: 'Em risco' },
  attention: { color: 'var(--warning)', label: 'Atenção' },
  healthy: { color: 'var(--success)', label: 'Saudável' },
  noData: { color: 'var(--muted-foreground)', label: 'Sem dados' },
};

const PILLAR_LABEL: Record<string, string> = {
  netMargin: 'Margem líquida',
  runway: 'Fôlego de caixa',
  primeCost: 'Prime Cost',
  revenueTrend: 'Tendência de vendas',
};

function currentMonthStr(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function pillarDetail(key: string, value: number | null): string {
  if (value === null) return 'sem dado suficiente';
  switch (key) {
    case 'netMargin':
      return `${pctFmt(value * 100)} de margem`;
    case 'primeCost':
      return `${pctFmt(value * 100)} da receita`;
    case 'runway':
      return `~${Math.round(value)} dias de caixa`;
    case 'revenueTrend':
      return `${value >= 0 ? '+' : ''}${pctFmt(value * 100)} vs. média`;
    default:
      return '';
  }
}

@Component({
  selector: 'app-visao-geral',
  standalone: true,
  imports: [
    IconComponent,
    ChipComponent,
    HintComponent,
    ButtonComponent,
    ModalComponent,
    StatCardComponent,
    ChartCardComponent,
    InsightCardComponent,
    SectionHeaderComponent,
    BulletComponent,
    WaterfallChartComponent,
    AreaChartComponent,
  ],
  templateUrl: './visao-geral.component.html',
})
export class VisaoGeralComponent implements OnInit {
  private svc = inject(DashboardService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected monthOpts = MONTH_OPTS;
  protected monthSel = signal<MonthOpt>('esteMes');
  protected customMonth = signal(currentMonthStr(-1));
  protected scoreOpen = signal(false);

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected pctFmt = pctFmt;
  protected abrev = abrev;
  protected fmtMonthLong = fmtMonthLong;
  protected readonly circumference = 2 * Math.PI * 46;
  protected readonly pillarLabel = PILLAR_LABEL;
  protected readonly pillarDetail = pillarDetail;
  protected readonly Math = Math;

  protected netProfitSpark = computed(
    () => this.data()?.cards.netProfit.history.map((h) => h.amount) ?? [],
  );
  protected revenueSpark = computed(
    () => this.data()?.cards.revenue.history.map((h) => h.amount) ?? [],
  );
  protected cashSpark = computed(
    () => this.data()?.cards.cashToday.realized.map((r) => r.balance) ?? [],
  );

  protected scoreMeta = computed(() => SCORE_META[this.data()?.health.label ?? 'noData']);

  protected scoreDashoffset = computed(() => {
    const score = this.data()?.health.score ?? 0;
    return this.circumference * (1 - score / 100);
  });

  protected scoreResumo = computed(() => {
    const health = this.data()?.health;
    if (!health) return '';
    const comDado = health.pillars.filter((p) => p.score !== null);
    if (comDado.length === 0)
      return 'Ainda não há dados suficientes para calcular sua saúde financeira.';
    const ordenados = [...comDado].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const fortes = ordenados.filter((p) => (p.score ?? 0) >= 75).slice(0, 2);
    const fraco = ordenados[ordenados.length - 1];
    const nome = (key: string) => (PILLAR_LABEL[key] ?? key).toLowerCase();
    const bons =
      fortes.length >= 2
        ? `${nome(fortes[0].key)} e ${nome(fortes[1].key)} estão bem`
        : fortes.length === 1
          ? `${nome(fortes[0].key)} está bem`
          : 'vários pontos precisam de atenção';
    return `Sua ${bons}. Fique de olho em ${nome(fraco.key)}.`;
  });

  protected mainData = computed(() => {
    const d = this.data();
    if (!d) return [];
    const byMonth = new Map<
      string,
      {
        month: string;
        receita: number | null;
        despesa: number | null;
        receitaProj: number | null;
        despesaProj: number | null;
      }
    >();
    for (const p of d.revenueVsExpense) {
      const month = fmtMonthShort(p.month);
      const row = byMonth.get(month) ?? {
        month,
        receita: null,
        despesa: null,
        receitaProj: null,
        despesaProj: null,
      };
      if (p.projected) {
        row.receitaProj = p.revenue;
        row.despesaProj = p.expense;
      } else {
        row.receita = p.revenue;
        row.despesa = p.expense;
      }
      byMonth.set(month, row);
    }
    const rows = [...byMonth.values()];
    const lastActual = [...rows].reverse().find((r) => r.receita !== null);
    if (lastActual && lastActual.receitaProj === null) {
      lastActual.receitaProj = lastActual.receita;
      lastActual.despesaProj = lastActual.despesa;
    }
    return rows;
  });

  protected mainSeries: AreaSeries[] = [
    { key: 'receita', name: 'Receita', color: 'var(--ocean)' },
    { key: 'receitaProj', name: 'Receita (projeção)', color: 'var(--ocean)', dashed: true },
    { key: 'despesa', name: 'Despesa', color: 'var(--warning)' },
    { key: 'despesaProj', name: 'Despesa (projeção)', color: 'var(--warning)', dashed: true },
  ];

  protected waterfall = computed<WaterfallRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    const w = d.profitWaterfall;
    return [
      { label: 'Receita Bruta', value: w.grossRevenue, kind: 'start' },
      { label: 'Impostos', value: -w.taxes, kind: 'down' },
      { label: 'CMV', value: -w.cmv, kind: 'down' },
      { label: 'Despesas', value: -w.operatingExpenses, kind: 'down' },
      { label: 'Lucro Líquido', value: w.netProfit, kind: 'end' },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  private monthQuery(): string | undefined {
    const sel = this.monthSel();
    if (sel === 'esteMes') return undefined;
    if (sel === 'mesPassado') return currentMonthStr(-1);
    return this.customMonth();
  }

  private load(): void {
    this.svc
      .refresh(this.monthQuery())
      .catch(() => this.toast.error('Não foi possível carregar a visão geral.'));
  }

  setMonth(m: MonthOpt): void {
    this.monthSel.set(m);
    this.load();
  }

  setCustomMonth(v: string): void {
    this.customMonth.set(v);
    if (this.monthSel() === 'personalizado') this.load();
  }

  insightSeverity(i: OverviewInsight): InsightSeverity {
    return i.severity === 'positive' ? 'positivo' : i.severity === 'info' ? 'atencao' : 'atencao';
  }

  insightTitle(i: OverviewInsight): string {
    switch (i.kind) {
      case 'cashTight':
        return `Caixa apertado a partir do dia ${i.date.slice(8, 10)}`;
      case 'cmvAboveTarget':
        return `Custo dos ingredientes acima do ideal (${pctFmt(i.pct * 100)})`;
      case 'primeCostAboveTarget':
        return `Prime Cost acima do ideal (${pctFmt(i.pct * 100)})`;
      case 'expenseAnomaly':
        return `${i.name} acima do normal`;
      case 'breakEvenReached':
        return `Ponto de equilíbrio atingido no dia ${i.day}`;
      case 'taxRegimeNotConfigured':
        return 'Regime tributário não configurado';
    }
  }

  insightDescription(i: OverviewInsight): string {
    switch (i.kind) {
      case 'cashTight':
        return `Contas concentradas devem reduzir seu caixa para cerca de ${this.fmtBRL(i.balance)} por volta do dia ${i.date.slice(8, 10)}.`;
      case 'cmvAboveTarget':
        return `Acima do teto de ${pctFmt(i.targetMax * 100)} — isso reduziu seu lucro em cerca de ${this.fmtBRL(i.impact)}.`;
      case 'primeCostAboveTarget':
        return `Acima do teto de ${pctFmt(i.targetMax * 100)} da receita.`;
      case 'expenseAnomaly':
        return `${this.fmtBRL(i.excess)} a mais que o normal em ${i.categoryName} (+${pctFmt(i.pctAbove * 100)}).`;
      case 'breakEvenReached':
        return 'Desde então, suas contas fixas do mês já estão cobertas — as próximas vendas são lucro.';
      case 'taxRegimeNotConfigured':
        return 'Sem o regime definido, o imposto do DRE sai zerado.';
    }
  }

  insightAction(i: OverviewInsight): string {
    switch (i.kind) {
      case 'cashTight':
        return 'Ver fluxo de caixa';
      case 'cmvAboveTarget':
      case 'primeCostAboveTarget':
      case 'expenseAnomaly':
        return 'Ver custos';
      case 'breakEvenReached':
        return 'Ver resultado';
      case 'taxRegimeNotConfigured':
        return 'Configurar regime';
    }
  }

  insightGo(i: OverviewInsight): void {
    switch (i.kind) {
      case 'cashTight':
        this.goTo('/fluxo-de-caixa');
        return;
      case 'cmvAboveTarget':
      case 'primeCostAboveTarget':
      case 'expenseAnomaly':
        this.goTo('/custos');
        return;
      case 'breakEvenReached':
      case 'taxRegimeNotConfigured':
        this.goTo('/resultado');
        return;
    }
  }

  goTo(path: string): void {
    this.router.navigate([path]);
  }
}
