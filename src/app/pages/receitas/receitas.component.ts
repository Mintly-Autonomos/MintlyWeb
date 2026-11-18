import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReceitasService, PeriodKey, FAIXAS, DIAS_SEMANA } from '../../services/receitas.service';
import { hoje } from '../../services/receitas.builder';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { METRIC_HINTS } from '../../shared/metric-hints';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { BarChartComponent, BarSeries } from '../../shared/bar-chart.component';
import { LineChartComponent, LineSeries } from '../../shared/line-chart.component';
import { StackedBarsComponent, StackedSeries } from '../../shared/stacked-bars.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL, formatCompact } from '../../shared/format';

const PERIODS: PeriodKey[] = ['Hoje', '7 dias', 'Este mês', 'Mês passado', 'Personalizado'];

const PAY_COLORS = ['var(--mint)', 'var(--ocean)', 'var(--warning)'];

@Component({
  selector: 'app-receitas',
  standalone: true,
  imports: [
    RouterLink,
    EmptyStateComponent,
    IconComponent,
    ChipComponent,
    HintComponent,
    StatCardComponent,
    ChartCardComponent,
    InsightCardComponent,
    BarChartComponent,
    LineChartComponent,
    StackedBarsComponent,
  ],
  templateUrl: './receitas.component.html',
})
export class ReceitasComponent implements OnInit {
  /** Texto do "?" de cada número e gráfico: o que é e como se calcula (P.1). */
  protected readonly h = METRIC_HINTS;
  private svc = inject(ReceitasService);
  private toast = inject(ToastService);

  protected periods = PERIODS;
  protected period = signal<PeriodKey>('Este mês');
  protected customFrom = signal(`${hoje().slice(0, 8)}01`);
  protected customTo = signal(hoje());
  protected rankMode = signal<'receita' | 'qtd' | 'lucro'>('receita');
  /** P.7: modo do "Quando você mais vende". Semana abre primeiro: funciona mesmo sem hora nas vendas. */
  protected modoQuando = signal<'dia' | 'semana' | 'mes' | 'ano' | 'mapa'>('semana');
  protected readonly modosQuando: {
    key: 'dia' | 'semana' | 'mes' | 'ano' | 'mapa';
    label: string;
  }[] = [
    { key: 'dia', label: 'Dia' },
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mês' },
    { key: 'ano', label: 'Ano' },
    { key: 'mapa', label: 'Mapa' },
  ];
  protected readonly quandoSerie: BarSeries[] = [
    { key: 'valor', name: 'Vendas', color: 'var(--ocean)' },
  ];
  protected readonly quandoAnoSeries: LineSeries[] = [
    { key: 'valor', name: 'Vendas', color: 'var(--ocean)' },
    { key: 'anoAnterior', name: 'Ano anterior', color: 'var(--muted-foreground)', dashed: true },
  ];
  /** Semana com o índice no rótulo ("Sáb · 1,40×"). */
  protected semanaRotulada = computed(() =>
    (this.data()?.quando.semana ?? []).map((s) => ({
      ...s,
      rotulo: `${s.dia} · ${s.indice.toFixed(2).replace('.', ',')}×`,
    })),
  );
  protected quandoSubtitulo = computed(
    () =>
      ({
        dia: 'Vendas por hora no período',
        semana: 'Vendas por dia da semana no período',
        mes: 'Vendas por dia do mês no período',
        ano: 'Vendas dos últimos 12 meses',
        mapa: 'Vendas por dia da semana e horário no período',
      })[this.modoQuando()],
  );
  protected melhorDia = computed(() => {
    const s = this.data()?.quando.semana ?? [];
    const top = [...s].sort((a, b) => b.valor - a.valor)[0];
    return top && top.valor > 0 ? top : null;
  });
  protected readonly rankModes: { key: 'receita' | 'qtd' | 'lucro'; label: string }[] = [
    { key: 'receita', label: 'Por receita (R$)' },
    { key: 'qtd', label: 'Por quantidade' },
    { key: 'lucro', label: 'Por lucro (R$)' },
  ];
  protected trendMode = signal<'total' | 'canal'>('total');

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected faixas = FAIXAS;
  protected diasSemana = DIAS_SEMANA;
  protected abrev = formatCompact;
  protected readonly Math = Math;
  protected readonly identityFormatter = (v: number) => String(v);

  protected canaisSeries: BarSeries[] = [
    { key: 'receita', name: 'Receita bruta', color: 'var(--ocean)' },
    { key: 'liquida', name: 'Receita líquida', color: 'var(--mint)' },
  ];
  protected tendenciaSeriesTotal = computed<LineSeries[]>(() =>
    this.data()?.tendencia[0]?.anoAnterior !== undefined
      ? [
          { key: 'total', name: 'Receita total', color: 'var(--ocean)' },
          {
            key: 'anoAnterior',
            name: 'Mesmo mês do ano anterior',
            color: 'var(--muted-foreground)',
            dashed: true,
          },
          { key: 'media3', name: 'Média de 3 meses', color: 'var(--mint)', dashed: true },
        ]
      : [{ key: 'total', name: 'Receita total', color: 'var(--ocean)' }],
  );
  private readonly serieSalao: LineSeries = { key: 'salao', name: 'Salão', color: 'var(--ocean)' };
  private readonly serieDelivery: LineSeries = {
    key: 'delivery',
    name: 'Delivery',
    color: 'var(--mint)',
  };
  private readonly serieEncomendas: LineSeries = {
    key: 'encomendas',
    name: 'Encomendas',
    color: 'var(--warning)',
  };
  /** Encomendas só entra no gráfico de quem já lançou alguma. */
  protected tendenciaSeriesCanal = computed<LineSeries[]>(() =>
    this.data()?.temEncomendas
      ? [this.serieSalao, this.serieDelivery, this.serieEncomendas]
      : [this.serieSalao, this.serieDelivery],
  );

  /** P.2: sazonalidade por canal, com o índice embaixo de cada mês. */
  protected sazonalLinhas = computed(() =>
    (this.data()?.sazonalidade.meses ?? []).map((m) => ({
      ...m,
      indiceTxt: m.parcial
        ? 'parcial'
        : m.indice === null
          ? ''
          : `${m.indice.toFixed(2).replace('.', ',')}×`,
    })),
  );
  protected sazonalSeries = computed<StackedSeries[]>(() =>
    this.data()?.temEncomendas
      ? [this.serieSalao, this.serieDelivery, this.serieEncomendas]
      : [this.serieSalao, this.serieDelivery],
  );
  protected sazonalCor = (d: Record<string, unknown>): string | null => {
    const t = d['temporada'];
    return t === 'alta' ? 'var(--success)' : t === 'baixa' ? 'var(--warning)' : null;
  };

  /** Ícone e cor do chip de cada canal. */
  protected canalChip(canal: string): { tone: 'mint' | 'warning' | 'ocean'; icon: string } {
    if (canal === 'Salão') return { tone: 'mint', icon: 'storefront' };
    if (canal === 'Encomendas') return { tone: 'ocean', icon: 'cake' };
    return { tone: 'warning', icon: 'delivery_dining' };
  }

  protected ranking = computed(() => {
    const d = this.data();
    if (!d) return [];
    const mode = this.rankMode();
    // "Por lucro" só com os pratos que têm custo no cardápio (sem custo não dá para saber o lucro).
    const base = mode === 'lucro' ? d.itens.filter((i) => i.lucro !== null) : d.itens;
    return [...base]
      .sort((a, b) =>
        mode === 'receita'
          ? b.receita - a.receita
          : mode === 'qtd'
            ? b.qtd - a.qtd
            : (b.lucro ?? 0) - (a.lucro ?? 0),
      )
      .slice(0, 8);
  });

  /** Subtítulo do ranking; avisa quantas vendas ficaram de fora por não informarem os pratos. */
  protected rankingDescription(semPratos: number): string {
    const partes = ['Ordenado do maior para o menor'];
    if (semPratos > 0) {
      partes.push(
        semPratos === 1
          ? '1 venda sem pratos informados fica de fora'
          : `${semPratos} vendas sem pratos informados ficam de fora`,
      );
    }
    const semCusto =
      this.rankMode() === 'lucro'
        ? (this.data()?.itens ?? []).filter((i) => i.lucro === null).length
        : 0;
    if (semCusto > 0) {
      partes.push(
        semCusto === 1
          ? '1 prato sem custo no cardápio fica de fora'
          : `${semCusto} pratos sem custo no cardápio ficam de fora`,
      );
    }
    return partes.join(' · ');
  }

  protected rankingSeries = computed<BarSeries[]>(() => [
    {
      key: this.rankMode(),
      name: 'Itens',
      color: this.rankMode() === 'lucro' ? 'var(--mint)' : 'var(--ocean)',
    },
  ]);

  protected rankingTooltipFormatter = computed(() =>
    this.rankMode() === 'qtd' ? this.identityFormatter : formatBRL,
  );

  protected rankingValueFormatter = computed(() =>
    this.rankMode() === 'qtd' ? this.identityFormatter : formatCompact,
  );

  /** P.9: "Bruta → líquida" numa barra só: o que fica com você, as taxas e os impostos. */
  protected composicao = computed(() => {
    const d = this.data();
    if (!d || d.receitaBruta <= 0) return [];
    const pct = (v: number) => (v / d.receitaBruta) * 100;
    return [
      { chave: 'liquida', nome: 'Fica com você', valor: d.receitaLiquida, cor: 'var(--mint)' },
      { chave: 'taxas', nome: 'Taxas', valor: d.taxas, cor: 'var(--warning)' },
      { chave: 'impostos', nome: 'Impostos sobre venda', valor: d.impostos, cor: 'var(--ocean)' },
    ].map((p) => ({ ...p, pct: Math.max(0, pct(p.valor)) }));
  });

  protected fmtPct(v: number): string {
    return `${v.toFixed(1).replace('.', ',')}%`;
  }

  /** P.9: receita por categoria em barras horizontais, da maior para a menor. */
  protected categoriaSeries: BarSeries[] = [
    { key: 'receita', name: 'Receita', color: 'var(--ocean)' },
  ];

  protected formasPagamentoSeries: BarSeries[] = [
    { key: 'valor', name: 'Recebido', color: 'var(--mint)' },
  ];

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.svc
      .refresh(this.period(), this.customFrom(), this.customTo())
      .catch(() => this.toast.error('Não foi possível carregar os dados de receitas.'));
  }

  setPeriod(p: PeriodKey): void {
    this.period.set(p);
    this.load();
  }

  setCustomFrom(v: string): void {
    this.customFrom.set(v);
    if (this.period() === 'Personalizado') this.load();
  }

  setCustomTo(v: string): void {
    this.customTo.set(v);
    if (this.period() === 'Personalizado') this.load();
  }

  payColor(_datum: unknown, index: number): string {
    return PAY_COLORS[index % PAY_COLORS.length];
  }

  heatmapCell(dia: string, faixa: string): { valor: number } | undefined {
    return this.data()?.heatmap?.find((h) => h.dia === dia && h.faixa === faixa);
  }

  heatmapBg(valor: number): string {
    const max = this.data()?.heatmapMax || 1;
    const p = valor / max;
    return p === 0
      ? 'var(--muted)'
      : `color-mix(in oklab, var(--mint) ${Math.round(12 + p * 78)}%, transparent)`;
  }

  heatmapColor(valor: number): string {
    const max = this.data()?.heatmapMax || 1;
    return valor / max > 0.55 ? 'var(--ocean)' : 'var(--muted-foreground)';
  }

  scrollToCanais(): void {
    document
      .getElementById('receitas-canais')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
