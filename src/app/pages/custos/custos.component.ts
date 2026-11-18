import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CategoryBehavior, DreGroup } from 'mintly-lib';
import { CustosService, ExpenseItem, ExpenseSubitem } from '../../services/custos.service';
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
import { CMV_HINT, PRIME_COST_HINT, METRIC_HINTS } from '../../shared/metric-hints';
import { comparisonNote, partialMonthLabel, statDelta } from '../../shared/stat-delta';
import { CmvAvisoComponent, DespesaForaDoCmv } from '../../shared/cmv-aviso.component';
import { formatBRL, fmtMonthLong, fmtMonthShort, formatCompact } from '../../shared/format';
import { MONTH_OPTS, MonthOpt, defaultMonthOpt, monthStr } from '../../shared/month-select';
import { StackedBarsComponent, StackedSeries } from '../../shared/stacked-bars.component';
import { GRUPOS, SEM_DETALHE, custosPorGrupo, grupoDe, percentuaisMensais } from './custos-grupos';

const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

type Compare = 'anterior' | 'media3';
type Lente = 'todos' | 'variaveis' | 'fixos';

interface LinhaDespesa extends ExpenseItem {
  metric: number;
}

@Component({
  selector: 'app-custos',
  standalone: true,
  imports: [
    StackedBarsComponent,
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
    CmvAvisoComponent,
  ],
  templateUrl: './custos.component.html',
})
export class CustosComponent implements OnInit {
  /** Texto do "?" de cada número e gráfico: o que é e como se calcula (P.1). */
  protected readonly h = METRIC_HINTS;
  private svc = inject(CustosService);
  private toast = inject(ToastService);

  protected monthOpts = MONTH_OPTS;
  // Do dia 1 ao 12 abre no mês passado (já fechado); depois, no mês atual.
  protected monthSel = signal<MonthOpt>(defaultMonthOpt());
  protected customMonth = signal(monthStr(-1));

  protected valueMode = signal<'brl' | 'pct'>('brl');
  protected compare = signal<Compare>('anterior');
  protected lente = signal<Lente>('todos');
  protected openCat = signal<string | null>(null);
  protected subDestaque = signal<string | null>(null);

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected pctFmt = pctFmt;
  protected abrev = formatCompact;
  protected fmtMonthLong = fmtMonthLong;
  protected readonly Math = Math;
  protected readonly CategoryBehavior = CategoryBehavior;
  protected readonly statDelta = statDelta;
  /** Legenda das variações: "vs. dias 1 a 4 de Outubro/2026" no mês em andamento. */
  protected notaComparacao = computed(() => {
    const d = this.data();
    return d ? comparisonNote(d.comparison, d.referenceMonth) : undefined;
  });
  protected mesParcial = computed(() => partialMonthLabel(this.data()?.comparison));
  protected readonly cmvHint = CMV_HINT;
  protected readonly primeCostHint = PRIME_COST_HINT;

  /** CMV zerado mas com despesa variável em "despesa operacional": provavelmente é insumo na categoria errada. */
  protected foraDoCmv = computed<DespesaForaDoCmv[]>(() => {
    const d = this.data();
    if (!d || d.cmv.amount > 0) return [];
    return d.items
      .filter(
        (i) =>
          i.kind === 'category' &&
          i.dreGroup === DreGroup.Opex &&
          i.behavior === CategoryBehavior.Variable &&
          i.amount > 0,
      )
      .map((i) => ({ name: i.name, amount: i.amount }));
  });

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

  // ── P.9: tabela agrupada ──
  private gruposFechados = signal<ReadonlySet<string>>(new Set());
  /** As linhas da tabela, em grupos (CMV, mão de obra, taxas, impostos, outras), na ordem do maior total. */
  protected gruposTabela = computed(() => {
    const total = this.totalLinhas() || 1;
    return GRUPOS.map((g) => {
      const itens = this.linhas().filter((l) => grupoDe(l) === g.key);
      const soma = itens.reduce((a, l) => a + l.amount, 0);
      return {
        key: g.key,
        nome: g.nome,
        cor: g.cor,
        itens,
        total: soma,
        pct: (soma / total) * 100,
      };
    })
      .filter((g) => g.itens.length > 0)
      .sort((a, b) => b.total - a.total);
  });
  protected grupoAberto(key: string): boolean {
    return !this.gruposFechados().has(key);
  }
  protected alternarGrupo(key: string): void {
    this.gruposFechados.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  protected maxMetric = computed(() => Math.max(...this.linhas().map((l) => l.metric), 1));
  protected totalLinhas = computed(() => this.linhas().reduce((acc, l) => acc + l.amount, 0));

  ngOnInit(): void {
    this.load();
  }

  private monthQuery(): string | undefined {
    const sel = this.monthSel();
    if (sel === 'esteMes') return undefined;
    if (sel === 'mesPassado') return monthStr(-1);
    return this.customMonth();
  }

  private load(): void {
    this.openCat.set(null);
    this.subDestaque.set(null);
    this.svc
      .refresh(this.monthQuery())
      .catch(() => this.toast.error('Não foi possível carregar os dados de custos.'));
    // P.9: receita de cada mês para o CMV % e o custo primário %; sem ela, só esse gráfico some.
    this.svc
      .receitaMensal(this.monthQuery())
      .then((r) => this.receitaMes.set(r))
      .catch(() => this.receitaMes.set(new Map()));
  }

  // ── P.9 (tabela 13.3): grupos de custo ──
  private receitaMes = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly grupoSeries: StackedSeries[] = [...GRUPOS, SEM_DETALHE].map((g) => ({
    key: g.key,
    name: g.nome,
    color: g.cor,
  }));
  /** Custo de cada grupo, mês a mês (barras empilhadas, eixo do zero). */
  protected porGrupo = computed(() =>
    custosPorGrupo(this.data()?.items ?? [], this.data()?.history ?? []).map((l) => ({
      ...l,
      mes: fmtMonthShort(l.mes),
    })),
  );
  /** CMV % e custo primário % de cada mês, com as metas tracejadas. */
  protected percentuais = computed(() => {
    const d = this.data();
    if (!d) return [];
    return percentuaisMensais(custosPorGrupo(d.items, d.history), this.receitaMes()).map((p) => ({
      mes: fmtMonthShort(p.mes),
      cmvPct: p.cmvPct,
      primePct: p.primePct,
      cmvMeta: Math.round(d.cmv.target.max * 1000) / 10,
      primeMeta: Math.round(d.primeCost.targetMax * 1000) / 10,
    }));
  });
  protected readonly percentuaisSeries: LineSeries[] = [
    { key: 'cmvPct', name: 'CMV %', color: 'var(--ocean)' },
    { key: 'cmvMeta', name: 'Teto do CMV', color: 'var(--ocean)', dashed: true },
    { key: 'primePct', name: 'Custo primário %', color: 'var(--mint)' },
    { key: 'primeMeta', name: 'Teto do custo primário', color: 'var(--mint)', dashed: true },
  ];
  protected readonly pctTexto = (v: number) => `${String(v).replace('.', ',')}%`;

  setMonth(m: MonthOpt): void {
    this.monthSel.set(m);
    this.load();
  }

  setCustomMonth(v: string): void {
    this.customMonth.set(v);
    if (this.monthSel() === 'personalizado') this.load();
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

  /** S3.3: a taxa da maquininha não soma com a comissão dos apps; aparece embaixo, separada. */
  protected taxaMaquininhaTexto = computed(() => {
    const c = this.data()?.cardFee;
    if (!c || c.amount <= 0) return '';
    const pct =
      c.pctOfCardRevenue != null
        ? ` (${this.pctFmt(c.pctOfCardRevenue * 100)} das vendas nela)`
        : '';
    return `Maquininha: ${this.fmtBRL(c.amount)}${pct}`;
  });

  iconForExpense(item: ExpenseItem): string {
    const n = item.name.toLowerCase();
    if (item.kind === 'cardFee') return 'credit_card';
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
