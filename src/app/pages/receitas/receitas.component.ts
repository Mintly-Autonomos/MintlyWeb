import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReceitasService, PeriodKey, FAIXAS, DIAS_SEMANA } from '../../services/receitas.service';
import { hoje } from '../../services/receitas.builder';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { WaterfallChartComponent } from '../../shared/waterfall-chart.component';
import { BarChartComponent, BarSeries } from '../../shared/bar-chart.component';
import { DonutChartComponent, DonutSlice } from '../../shared/donut-chart.component';
import { LineChartComponent, LineSeries } from '../../shared/line-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL } from '../../shared/format';

const PERIODS: PeriodKey[] = ['Hoje', '7 dias', 'Este mês', 'Mês passado', 'Personalizado'];

const abrev = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
const CAT_COLORS = ['var(--ocean)', 'var(--mint)', 'var(--warning)', 'var(--success)'];
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
    WaterfallChartComponent,
    BarChartComponent,
    DonutChartComponent,
    LineChartComponent,
  ],
  templateUrl: './receitas.component.html',
})
export class ReceitasComponent implements OnInit {
  private svc = inject(ReceitasService);
  private toast = inject(ToastService);

  protected periods = PERIODS;
  protected period = signal<PeriodKey>('Este mês');
  protected customFrom = signal(`${hoje().slice(0, 8)}01`);
  protected customTo = signal(hoje());
  protected rankMode = signal<'receita' | 'qtd'>('receita');
  protected trendMode = signal<'total' | 'canal'>('total');

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected faixas = FAIXAS;
  protected diasSemana = DIAS_SEMANA;
  protected abrev = abrev;
  protected readonly Math = Math;
  protected readonly identityFormatter = (v: number) => String(v);

  protected canaisSeries: BarSeries[] = [
    { key: 'receita', name: 'Receita bruta', color: 'var(--ocean)' },
    { key: 'liquida', name: 'Receita líquida', color: 'var(--mint)' },
  ];
  protected tendenciaSeriesTotal: LineSeries[] = [
    { key: 'total', name: 'Receita total', color: 'var(--ocean)' },
  ];
  protected tendenciaSeriesCanal: LineSeries[] = [
    { key: 'salao', name: 'Salão', color: 'var(--ocean)' },
    { key: 'delivery', name: 'Delivery', color: 'var(--mint)' },
  ];

  protected ranking = computed(() => {
    const d = this.data();
    if (!d) return [];
    const mode = this.rankMode();
    return [...d.itens]
      .sort((a, b) => (mode === 'receita' ? b.receita - a.receita : b.qtd - a.qtd))
      .slice(0, 8);
  });

  protected rankingSeries = computed<BarSeries[]>(() => [
    {
      key: this.rankMode() === 'receita' ? 'receita' : 'qtd',
      name: 'Itens',
      color: 'var(--ocean)',
    },
  ]);

  protected rankingValueFormatter = computed(() =>
    this.rankMode() === 'receita' ? abrev : this.identityFormatter,
  );

  protected porCategoriaSlices = computed<DonutSlice[]>(() => {
    const d = this.data();
    if (!d) return [];
    return d.porCategoria.map((c, i) => ({
      label: c.categoria,
      value: c.receita,
      color: CAT_COLORS[i % CAT_COLORS.length],
    }));
  });

  protected catTotal = computed(
    () => this.porCategoriaSlices().reduce((s, c) => s + c.value, 0) || 1,
  );

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
