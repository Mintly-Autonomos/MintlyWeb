import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CategoryBehavior } from 'mintly-lib';
import {
  CustosService,
  ExpenseItem,
  ExpenseSubitem,
  ChannelFilter,
} from '../../services/custos.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import { BulletComponent } from '../../shared/bullet.component';
import { ToggleGroupComponent, ToggleGroupOption } from '../../shared/toggle-group.component';
import { LineChartComponent, LineSeries } from '../../shared/line-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL, fmtMonthLong, fmtMonthShort } from '../../shared/format';

type MonthOpt = 'esteMes' | 'mesPassado' | 'personalizado';
const MONTH_OPTS: { key: MonthOpt; label: string }[] = [
  { key: 'esteMes', label: 'Este mês' },
  { key: 'mesPassado', label: 'Mês passado' },
  { key: 'personalizado', label: 'Personalizado' },
];

const abrev = (v: number) =>
  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

type Compare = 'anterior' | 'media3';
type Lente = 'todos' | 'variaveis' | 'fixos';
type Canal = 'geral' | 'salao' | 'delivery';

interface LinhaDespesa extends ExpenseItem {
  metric: number;
}

function currentMonthStr(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const TREND_COLORS = [
  'var(--warning)',
  'var(--ocean)',
  'var(--mint)',
  'var(--success)',
  'var(--error)',
];

@Component({
  selector: 'app-custos',
  standalone: true,
  imports: [
    IconComponent,
    ChipComponent,
    HintComponent,
    StatCardComponent,
    ChartCardComponent,
    InsightCardComponent,
    SectionHeaderComponent,
    BulletComponent,
    ToggleGroupComponent,
    LineChartComponent,
  ],
  templateUrl: './custos.component.html',
})
export class CustosComponent implements OnInit {
  private svc = inject(CustosService);
  private toast = inject(ToastService);

  protected monthOpts = MONTH_OPTS;
  protected monthSel = signal<MonthOpt>('esteMes');
  protected customMonth = signal(currentMonthStr(-1));

  protected valueMode = signal<'brl' | 'pct'>('brl');
  protected compare = signal<Compare>('anterior');
  protected lente = signal<Lente>('todos');
  protected canal = signal<Canal>('geral');
  protected trendMode = signal<'total' | 'categoria'>('total');
  protected openCat = signal<string | null>(null);
  protected subDestaque = signal<string | null>(null);

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected pctFmt = pctFmt;
  protected abrev = abrev;
  protected fmtMonthLong = fmtMonthLong;
  protected readonly Math = Math;
  protected readonly CategoryBehavior = CategoryBehavior;

  protected historySpark = computed(() => this.data()?.history.map((h) => h.total) ?? []);

  protected compareOpts: ToggleGroupOption[] = [
    { value: 'anterior', label: 'vs. mês anterior' },
    { value: 'media3', label: 'vs. média 3 meses' },
  ];
  protected valueModeOpts: ToggleGroupOption[] = [
    { value: 'brl', label: 'R$' },
    { value: 'pct', label: '% da receita' },
  ];
  protected lenteOpts: ToggleGroupOption[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'variaveis', label: 'Só variáveis' },
    { value: 'fixos', label: 'Só fixos' },
  ];
  protected canalOpts: ToggleGroupOption[] = [
    { value: 'geral', label: 'Geral' },
    { value: 'salao', label: 'Salão' },
    { value: 'delivery', label: 'Delivery' },
  ];

  protected trendSeriesTotal: LineSeries[] = [
    { key: 'total', name: 'Total de despesas', color: 'var(--ocean)' },
  ];

  /** Linha a linha, já filtrada pelo "lente" (fixo/variável — misto entra como fixo, N4/§351). */
  protected linhas = computed<LinhaDespesa[]>(() => {
    const d = this.data();
    if (!d) return [];
    const lente = this.lente();
    const valueMode = this.valueMode();
    return d.items
      .filter((x) => {
        if (lente === 'todos') return true;
        const isFixo =
          x.behavior === CategoryBehavior.Fixed || x.behavior === CategoryBehavior.Mixed;
        return lente === 'fixos' ? isFixo : !isFixo;
      })
      .map((x) => ({
        ...x,
        metric: valueMode === 'brl' ? x.amount : (x.amount / (d.revenue.current || 1)) * 100,
      }))
      .sort((a, b) => b.amount - a.amount);
  });

  protected maxMetric = computed(() => Math.max(...this.linhas().map((l) => l.metric), 1));
  protected totalLinhas = computed(() => this.linhas().reduce((acc, l) => acc + l.amount, 0));

  /** Série "Por categoria": as 5 maiores despesas do mês, cada uma com sua própria série de cor. */
  protected trendSeriesCategoria = computed<LineSeries[]>(() =>
    (this.data()?.items ?? [])
      .slice(0, 5)
      .map((item, i) => ({
        key: item.key,
        name: item.name,
        color: TREND_COLORS[i % TREND_COLORS.length],
      })),
  );
  protected trendDataCategoria = computed(() => {
    const top5 = (this.data()?.items ?? []).slice(0, 5);
    if (top5.length === 0) return [];
    const meses = top5[0].history.map((h) => h.month);
    return meses.map((mes, i) => {
      const row: Record<string, string | number> = { mes: fmtMonthShort(mes) };
      for (const item of top5) row[item.key] = item.history[i]?.amount ?? 0;
      return row;
    });
  });
  protected trendDataTotal = computed(
    () => this.data()?.history.map((h) => ({ mes: fmtMonthShort(h.month), total: h.total })) ?? [],
  );

  ngOnInit(): void {
    this.load();
  }

  private monthQuery(): string | undefined {
    const sel = this.monthSel();
    if (sel === 'esteMes') return undefined;
    if (sel === 'mesPassado') return currentMonthStr(-1);
    return this.customMonth();
  }

  private channelQuery(): ChannelFilter {
    const c = this.canal();
    return c === 'salao' ? 'dineIn' : c === 'delivery' ? 'delivery' : undefined;
  }

  private load(): void {
    this.openCat.set(null);
    this.subDestaque.set(null);
    this.svc
      .refresh(this.monthQuery(), this.channelQuery())
      .catch(() => this.toast.error('Não foi possível carregar os dados de custos.'));
  }

  setMonth(m: MonthOpt): void {
    this.monthSel.set(m);
    this.load();
  }

  setCustomMonth(v: string): void {
    this.customMonth.set(v);
    if (this.monthSel() === 'personalizado') this.load();
  }

  setCanal(c: Canal): void {
    this.canal.set(c);
    this.load();
  }

  toggleCat(key: string): void {
    this.openCat.set(this.openCat() === key ? null : key);
    this.subDestaque.set(null);
  }

  abrirAlerta(itemKey: string, subitemKey: string | null): void {
    this.openCat.set(itemKey);
    this.subDestaque.set(subitemKey);
    this.lente.set('todos');
    requestAnimationFrame(() =>
      document
        .getElementById('custos-onde')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  temAlerta(item: ExpenseItem): boolean {
    return item.hasAnomaly;
  }

  isAnomalo(sub: ExpenseSubitem): boolean {
    return sub.anomaly;
  }

  iconForExpense(item: ExpenseItem): string {
    const n = item.name.toLowerCase();
    if (
      item.kind === 'platformFee' ||
      n.includes('taxa') ||
      n.includes('ifood') ||
      n.includes('delivery')
    )
      return 'delivery_dining';
    if (
      item.behavior === CategoryBehavior.Fixed &&
      (n.includes('pró-labore') || n.includes('salári'))
    )
      return 'badge';
    if (n.includes('aluguel')) return 'storefront';
    if (n.includes('cmv') || n.includes('insumo')) return 'shopping_basket';
    if (n.includes('luz') || n.includes('água') || n.includes('gás') || n.includes('utilidade'))
      return 'bolt';
    if (n.includes('contador') || n.includes('contabilidade')) return 'receipt_long';
    if (n.includes('cartão') || n.includes('maquininha')) return 'credit_card';
    if (n.includes('marketing') || n.includes('anúncio')) return 'campaign';
    if (n.includes('limpeza') || n.includes('manutenção')) return 'cleaning_services';
    return 'receipt_long';
  }

  itemDelta(item: ExpenseItem): number | null {
    return this.compare() === 'anterior' ? item.deltaPrevious : item.deltaAverage3;
  }

  deltaOf(fraction: number | null): { text: string; up: boolean; neutral: boolean; novo: boolean } {
    if (fraction === null) return { text: 'novo', up: false, neutral: false, novo: true };
    const p = fraction * 100;
    if (Math.abs(p) < 1) return { text: 'estável', up: false, neutral: true, novo: false };
    return { text: `${Math.abs(p).toFixed(0)}%`, up: p >= 0, neutral: false, novo: false };
  }

  subDelta(sub: ExpenseSubitem): number | null {
    return this.compare() === 'anterior' ? sub.deltaPrevious : sub.deltaAverage3;
  }
}
