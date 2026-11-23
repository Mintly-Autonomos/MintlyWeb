import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { SeriePeriodoComponent } from '../../shared/serie-periodo.component';
import { CategoryBehavior } from 'mintly-lib';
import type { ResultHistoryMonths } from 'mintly-lib';
import { ResultadoService, OpexItem } from '../../services/resultado.service';
import { RestauranteService, TaxRegimeKey } from '../../services/restaurante.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { METRIC_HINTS } from '../../shared/metric-hints';
import { ButtonComponent } from '../../shared/button.component';
import { ModalComponent } from '../../shared/modal.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import type { WaterfallRow } from '../../shared/waterfall-chart.component';
import { ProfitBridgeComponent } from '../../shared/profit-bridge.component';
import { BarChartComponent, BarSeries } from '../../shared/bar-chart.component';
import { LineChartComponent, LineSeries } from '../../shared/line-chart.component';
import { ToastService } from '../../shared/toast.service';
import { ehCategoriaDeTaxa, ehTaxaDeVenda } from '../../shared/taxa-venda';
import {
  comparisonBase,
  comparisonNote,
  partialMonthLabel,
  statDelta,
} from '../../shared/stat-delta';
import { CmvAvisoComponent, DespesaForaDoCmv } from '../../shared/cmv-aviso.component';
import {
  formatBRL,
  fmtMonthLong,
  fmtMonthShort,
  formatCompact,
  localISODate,
} from '../../shared/format';
import { MONTH_OPTS, MonthOpt, defaultMonthOpt, monthStr } from '../../shared/month-select';
import { MovimentacoesService } from '../../services/movimentacoes.service';
import { CategoriasService } from '../../services/categorias.service';
import { vendaAcumulada } from './venda-acumulada';

const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

interface DeltaInfo {
  novo: boolean;
  estavel: boolean;
  bom: boolean;
  subiu: boolean;
  text: string;
}

interface LinhaDRE {
  label: string;
  valor: number;
  tipo: 'receita' | 'deducao' | 'subtotal' | 'resultado';
  pctReceita: number;
  explicacao: string;
  deltaFraction: number | null;
}

interface DespesaView {
  nome: string;
  valor: number;
  tipo: 'fixo' | 'variavel' | 'misto';
  icon: string;
  delta: number | null;
}

function iconForExpense(name: string, kind: OpexItem['kind']): string {
  const n = name.toLowerCase();
  if (kind === 'cardFee') return 'credit_card';
  if (kind === 'platformFee' || n.includes('taxa') || n.includes('ifood') || n.includes('delivery'))
    return 'delivery_dining';
  if (kind === 'labor' || n.includes('pró-labore') || n.includes('salári')) return 'badge';
  if (n.includes('aluguel')) return 'storefront';
  if (n.includes('luz') || n.includes('água') || n.includes('gás') || n.includes('utilidade'))
    return 'bolt';
  if (n.includes('contador') || n.includes('contabilidade')) return 'receipt_long';
  if (n.includes('cartão') || n.includes('maquininha')) return 'credit_card';
  if (n.includes('marketing') || n.includes('anúncio')) return 'campaign';
  if (n.includes('limpeza') || n.includes('manutenção')) return 'cleaning_services';
  return 'receipt_long';
}

const REGIME_LABEL: Record<TaxRegimeKey, string> = {
  mei: 'MEI',
  simplesNacionalAnexoI: 'Simples Nacional — Anexo I',
  simplesNacionalAnexoII: 'Simples Nacional — Anexo II',
};

/** A regra de taxa é a mesma de Custos e Receitas (shared/taxa-venda). */
export { ehCategoriaDeTaxa };

@Component({
  selector: 'app-resultado',
  standalone: true,
  imports: [
    SeriePeriodoComponent,
    IconComponent,
    ChipComponent,
    HintComponent,
    ButtonComponent,
    ModalComponent,
    StatCardComponent,
    ChartCardComponent,
    InsightCardComponent,
    SectionHeaderComponent,
    ProfitBridgeComponent,
    BarChartComponent,
    LineChartComponent,
    CmvAvisoComponent,
  ],
  templateUrl: './resultado.component.html',
})
export class ResultadoComponent implements OnInit {
  /** Texto do "?" de cada número e gráfico: o que é e como se calcula (P.1). */
  protected readonly h = METRIC_HINTS;
  private svc = inject(ResultadoService);
  private restauranteSvc = inject(RestauranteService);
  private toast = inject(ToastService);
  private movimentacoes = inject(MovimentacoesService);
  private categorias = inject(CategoriasService);

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected pctFmt = pctFmt;
  protected abrev = formatCompact;
  protected readonly Math = Math;
  protected readonly statDelta = statDelta;
  /** Legenda das variações: "vs. dias 1 a 4 de Outubro/2026" no mês em andamento. */
  protected notaComparacao = computed(() => {
    const d = this.data();
    return d ? comparisonNote(d.comparison, d.referenceMonth) : undefined;
  });
  protected mesParcial = computed(() => partialMonthLabel(this.data()?.comparison));
  /** "aos dias 1 a 22 de Outubro/2026" (mês em andamento) ou "a Outubro/2026". */
  protected baseComparacao = computed(() => {
    const d = this.data();
    return d ? comparisonBase(d.comparison, d.referenceMonth) : '';
  });
  /**
   * No mês em andamento a leitura compara os mesmos dias; esta frase traz o mês anterior INTEIRO, para ninguém achar
   * que o mês já está melhor que ele. null no mês fechado ou sem o mês no histórico.
   */
  protected mesAnteriorInteiro = computed(() => {
    const d = this.data();
    if (!d || d.comparison?.kind !== 'samePeriod') return null;
    const h = d.history.find((p) => p.month === d.previousMonth);
    if (!h) return null;
    const margem = h.netMargin == null ? '' : ` (margem de ${pctFmt(h.netMargin * 100)})`;
    return ` ${fmtMonthLong(d.previousMonth)} inteiro fechou com ${h.netProfit < 0 ? 'prejuízo' : 'lucro'} de ${formatBRL(Math.abs(h.netProfit))}${margem}.`;
  });
  /** Mês futuro (U.4): o DRE mostra só o que já está lançado com competência nele. */
  protected mesFuturo = computed(() => {
    const d = this.data();
    return !!d && d.referenceMonth > monthStr(0);
  });
  /** Até 12 meses à frente, como a API aceita. */
  protected readonly mesMaximo = monthStr(12);
  /** Meses do gráfico de histórico: 6 ou 12. */
  protected mesesHistorico = signal<ResultHistoryMonths>(12);
  /** Mesmo mês do ano anterior (U.4): receita e lucro com a variação. null = sem lançamento lá. */
  protected anoAnterior = computed(() => {
    const py = this.data()?.previousYear;
    if (!py) return null;
    const nota = `vs. ${fmtMonthLong(py.month)}`;
    return {
      mes: fmtMonthLong(py.month),
      receita: py.lines.grossRevenue,
      lucro: py.lines.netProfit,
      receitaDelta: statDelta(py.deltas.grossRevenue, {
        note: nota,
        base: { current: this.data()!.current.grossRevenue, previous: py.lines.grossRevenue },
      }),
      lucroDelta: statDelta(py.deltas.netProfit, {
        note: nota,
        base: {
          current: this.data()!.current.netProfit,
          previous: py.lines.netProfit,
          lucro: true,
        },
      }),
    };
  });
  protected regimeLabel = REGIME_LABEL;
  protected fmtMonthLong = fmtMonthLong;

  protected monthOpts = MONTH_OPTS;
  // Do dia 1 ao 12 abre no mês passado (já fechado); depois, no mês atual.
  protected monthSel = signal<MonthOpt>(defaultMonthOpt());
  protected customMonth = signal(monthStr(-1));

  protected unidade = signal<'reais' | 'pct'>('reais');
  protected serie = signal<'lucro' | 'margem'>('lucro');
  protected dreOpen = signal(false);
  protected regimeOpen = signal(false);
  protected savingRegime = signal(false);

  protected linhasDRE = computed<LinhaDRE[]>(() => {
    const d = this.data();
    if (!d) return [];
    const rev = d.current.grossRevenue || 1;
    const pct = (v: number) => (v / rev) * 100;
    const temNaoOperacional =
      (d.current.nonOperatingIncome ?? 0) !== 0 || (d.current.nonOperatingExpenses ?? 0) !== 0;
    const linhas: LinhaDRE[] = [
      {
        label: 'Receita bruta',
        valor: d.current.grossRevenue,
        tipo: 'receita',
        pctReceita: 100,
        explicacao:
          'Tudo que você vendeu no mês, no salão e no delivery, antes de qualquer desconto.',
        deltaFraction: d.deltas.grossRevenue,
      },
      {
        label: 'Impostos sobre venda',
        valor: -d.current.taxes,
        tipo: 'deducao',
        pctReceita: -pct(d.current.taxes),
        explicacao:
          'O que sai direto do faturamento para o governo, conforme o regime tributário configurado.',
        deltaFraction: d.deltas.taxes,
      },
      {
        label: 'Receita líquida',
        valor: d.current.netRevenue,
        tipo: 'subtotal',
        pctReceita: pct(d.current.netRevenue),
        explicacao: 'O que realmente entrou depois dos impostos.',
        deltaFraction: d.deltas.netRevenue,
      },
      {
        label: 'CMV — ingredientes e insumos',
        valor: -d.current.cmv,
        tipo: 'deducao',
        pctReceita: -pct(d.current.cmv),
        explicacao: 'Quanto custou o que você vendeu: ingredientes, bebidas e embalagens.',
        deltaFraction: d.deltas.cmv,
      },
      {
        label: 'Margem bruta',
        valor: d.current.grossMargin,
        tipo: 'subtotal',
        pctReceita: pct(d.current.grossMargin),
        explicacao: 'O que sobra da venda para pagar todas as contas do restaurante.',
        deltaFraction: d.deltas.grossMargin,
      },
      {
        label: 'Despesas operacionais',
        valor: -d.current.operatingExpenses,
        tipo: 'deducao',
        pctReceita: -pct(d.current.operatingExpenses),
        explicacao:
          'Pró-labore, aluguel, taxa de plataforma, utilidades, cartão, marketing e contador.',
        deltaFraction: d.deltas.operatingExpenses,
      },
      {
        label: temNaoOperacional ? 'Resultado operacional (lucro do mês)' : 'Resultado do mês',
        valor: d.current.netProfit,
        tipo: 'resultado',
        pctReceita: pct(d.current.netProfit),
        explicacao: temNaoOperacional
          ? 'O que a operação do restaurante deixou no mês, sem empréstimos, aportes e compras de equipamento.'
          : 'O que sobrou de verdade no fim das contas.',
        deltaFraction: d.deltas.netProfit,
      },
    ];
    if (!temNaoOperacional) return linhas;
    // Não operacional fica abaixo do lucro: mexe no dinheiro, mas não diz se o restaurante dá lucro.
    return [
      ...linhas,
      {
        label: 'Entradas não operacionais',
        valor: d.current.nonOperatingIncome,
        tipo: 'receita',
        pctReceita: pct(d.current.nonOperatingIncome),
        explicacao:
          'Dinheiro que entrou sem ser venda: empréstimo recebido, aporte do dono, saldo inicial.',
        deltaFraction: d.deltas.nonOperatingIncome ?? null,
      },
      {
        label: 'Saídas não operacionais',
        valor: -d.current.nonOperatingExpenses,
        tipo: 'deducao',
        pctReceita: -pct(d.current.nonOperatingExpenses),
        explicacao:
          'Gastos fora da operação: compra de equipamento, parcelas e juros de empréstimo.',
        deltaFraction: d.deltas.nonOperatingExpenses ?? null,
      },
      {
        label: 'Resultado depois do não operacional',
        valor: d.current.resultAfterNonOperating,
        tipo: 'subtotal',
        pctReceita: pct(d.current.resultAfterNonOperating),
        explicacao:
          'Lucro do mês mais as entradas e menos as saídas não operacionais: quanto o mês mexeu no seu dinheiro.',
        deltaFraction: d.deltas.resultAfterNonOperating ?? null,
      },
    ];
  });

  protected waterfallResultado = computed<WaterfallRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    const c = d.current;
    const taxas = d.operatingExpenseItems
      .filter((i) => ehTaxaDeVenda(i))
      .reduce((s, i) => s + i.amount, 0);
    const soma = (kinds: string[]) =>
      d.operatingExpenseItems
        .filter((i) => kinds.includes(i.kind))
        .reduce((s, i) => s + i.amount, 0);
    // Reteste 18/11, item 11, e 22/11, T4: as taxas calculadas pelas contas e as despesas em categoria de taxa
    // (ex.: "Taxas de cartão e iFood", aluguel da maquininha), pela mesma regra de Custos e Receitas.
    const pessoal = soma(['labor']);
    const outras = Math.max(0, c.operatingExpenses - taxas - pessoal);
    const naoOp = (c.nonOperatingIncome ?? 0) !== 0 || (c.nonOperatingExpenses ?? 0) !== 0;
    const linhas: WaterfallRow[] = [
      { label: 'Vendas', value: c.grossRevenue, kind: 'start' },
      { label: 'Impostos sobre venda', value: -c.taxes, kind: 'down' },
      { label: 'Taxas de cartão, apps e maquininha', value: -taxas, kind: 'down' },
      { label: 'CMV (insumos)', value: -c.cmv, kind: 'down' },
      { label: 'Mão de obra', value: -pessoal, kind: 'down' },
      { label: 'Outras despesas', value: -outras, kind: 'down' },
      {
        label: naoOp ? 'Resultado operacional' : 'Resultado do mês',
        value: c.netProfit,
        kind: 'end',
      },
    ];
    if (naoOp) {
      linhas.push(
        { label: 'Entradas não operacionais', value: c.nonOperatingIncome ?? 0, kind: 'up' },
        { label: 'Saídas não operacionais', value: -(c.nonOperatingExpenses ?? 0), kind: 'down' },
        {
          label: 'Depois do não operacional',
          value: c.resultAfterNonOperating ?? c.netProfit,
          kind: 'end',
        },
      );
    }
    // Etapa zerada não ajuda a ler (ex.: sem imposto configurado): sai da ponte.
    return linhas.filter((l) => l.kind === 'start' || l.kind === 'end' || l.value !== 0);
  });

  /** CMV zerado mas com despesa variável em despesa operacional: provavelmente é insumo na categoria errada. */
  protected foraDoCmv = computed<DespesaForaDoCmv[]>(() => {
    const d = this.data();
    if (!d || d.current.cmv > 0) return [];
    return d.operatingExpenseItems
      .filter((i) => i.kind === 'opex' && i.behavior === CategoryBehavior.Variable && i.amount > 0)
      .map((i) => ({ name: i.name, amount: i.amount }));
  });

  protected despesasOrdenadas = computed<DespesaView[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [...d.operatingExpenseItems]
      .sort((a, b) => b.amount - a.amount)
      .map((i) => ({
        nome: i.name,
        valor: i.amount,
        tipo:
          i.behavior === CategoryBehavior.Fixed
            ? 'fixo'
            : i.behavior === CategoryBehavior.Mixed
              ? 'misto'
              : 'variavel',
        icon: iconForExpense(i.name, i.kind),
        delta: i.delta,
      }));
  });

  protected historicoView = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.history.map((h) => ({
      mes: fmtMonthShort(h.month),
      lucro: h.netProfit,
      margem: (h.netMargin ?? 0) * 100,
      receita: h.grossRevenue,
    }));
  });

  protected lucroSpark = computed(() => this.historicoView().map((h) => h.lucro));

  protected lucroSeries: BarSeries[] = [{ key: 'lucro', name: 'Lucro', color: 'var(--success)' }];
  /** P.9: mês com prejuízo em vermelho (antes todos saíam verdes). */
  protected lucroCor = (datum: unknown): string =>
    ((datum as { lucro: number }).lucro ?? 0) < 0 ? 'var(--error)' : 'var(--success)';

  /** P.9: venda acumulada do mês contra o ponto de equilíbrio. null sem ponto de equilíbrio ou sem dados. */
  protected acumulada = computed(() => {
    const d = this.data();
    const alvo = d?.breakEven.breakEvenRevenue;
    if (!d || !alvo) return null;
    const cats = this.categorias.categories();
    const fora = new Set(
      cats.filter((c) => c.system || c.nature === 'non-operational').map((c) => c.id),
    );
    const vendas = this.movimentacoes
      .movements()
      .filter(
        (m) =>
          m.type === 'income' &&
          m.status !== 'cancelled' &&
          !m.transfer &&
          !(m.categoryId && fora.has(m.categoryId)),
      )
      .map((m) => ({ date: m.date, gross: m.value }));
    const r = vendaAcumulada(vendas, d.referenceMonth, alvo, localISODate());
    return r.pontos.length > 0 ? r : null;
  });

  protected acumuladaSeries: LineSeries[] = [
    { key: 'acumulado', name: 'Vendido no mês', color: 'var(--ocean)' },
    { key: 'equilibrio', name: 'Ponto de equilíbrio', color: 'var(--warning)', dashed: true },
  ];

  protected acumuladaTexto = computed(() => {
    const a = this.acumulada();
    if (!a) return '';
    if (a.cruzouNoDia !== null)
      return `Passou do ponto de equilíbrio no dia ${a.cruzouNoDia}. Daí em diante, o que sobra de cada venda vira lucro.`;
    const ritmo = `${formatBRL(a.ritmoDia)} por dia`;
    if (a.ateDia < a.diasNoMes) {
      return a.previsaoDia !== null
        ? `No ritmo atual (${ritmo}), você passa do ponto de equilíbrio no dia ${a.previsaoDia}.`
        : `No ritmo atual (${ritmo}), o mês não chega ao ponto de equilíbrio: faltam ${formatBRL(a.falta)}.`;
    }
    return `O mês fechou sem chegar ao ponto de equilíbrio: faltaram ${formatBRL(a.falta)}.`;
  });
  protected margemSeries: LineSeries[] = [{ key: 'margem', name: 'Margem', color: 'var(--ocean)' }];

  protected margemLiquida = computed(() => (this.data()?.current.netMargin ?? 0) * 100);
  protected margemLiquidaAnterior = computed(() => (this.data()?.previous.netMargin ?? 0) * 100);
  protected margemContribuicaoPct = computed(
    () => (this.data()?.breakEven.contributionMarginPct ?? 0) * 100,
  );

  ngOnInit(): void {
    this.load();
  }

  /** `undefined` = mês corrente (a API assume). */
  private monthQuery(): string | undefined {
    const sel = this.monthSel();
    if (sel === 'esteMes') return undefined;
    if (sel === 'mesPassado') return monthStr(-1);
    return this.customMonth();
  }

  private load(): Promise<void> {
    // Venda acumulada do mês (P.9): sai das movimentações; sem elas, só o gráfico some.
    void Promise.all([this.movimentacoes.refresh(), this.categorias.refresh()]).catch(
      () => undefined,
    );
    return this.svc
      .refresh(this.monthQuery(), this.mesesHistorico())
      .catch(() => this.toast.error('Não foi possível carregar o resultado do mês.'));
  }

  setMesesHistorico(n: ResultHistoryMonths): void {
    if (n === this.mesesHistorico()) return;
    this.mesesHistorico.set(n);
    void this.load();
  }

  setMonth(m: MonthOpt): void {
    this.monthSel.set(m);
    void this.load();
  }

  setCustomMonth(v: string): void {
    this.customMonth.set(v);
    if (this.monthSel() === 'personalizado') void this.load();
  }

  formatDelta(fraction: number | null, inverso = false): DeltaInfo {
    if (fraction === null)
      return { novo: true, estavel: false, bom: false, subiu: false, text: '' };
    const pct = fraction * 100;
    const subiu = pct > 0;
    const bom = inverso ? !subiu : subiu;
    if (Math.abs(pct) < 0.05) return { novo: false, estavel: true, bom, subiu, text: '' };
    return {
      novo: false,
      estavel: false,
      bom,
      subiu,
      text: `${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
    };
  }

  despesaShare(d: DespesaView): number {
    const total = this.data()?.current.operatingExpenses || 1;
    return (d.valor / total) * 100;
  }

  /** % de uma parte sobre a receita bruta; 0 quando ainda não há receita (evita NaN). */
  protected pctDaReceita(part: number): number {
    const rev = this.data()?.current.grossRevenue ?? 0;
    return rev > 0 ? (part / rev) * 100 : 0;
  }

  /** Quanto do ponto de equilíbrio já foi vendido (0–100). */
  breakEvenPct(): number {
    const d = this.data();
    if (!d || !d.breakEven.breakEvenRevenue || !d.current.grossRevenue) return 0;
    return Math.min(100, (d.current.grossRevenue / d.breakEven.breakEvenRevenue) * 100);
  }

  /**
   * Margem de contribuição sobre a receita bruta: custos fixos ÷ ponto de equilíbrio. É a que fecha
   * a conta mostrada na tela (a da API é sobre a receita líquida). Sem ponto de equilíbrio → null.
   */
  protected breakEvenInfo = computed(() => {
    const be = this.data()?.breakEven;
    if (!be?.breakEvenRevenue) return null;
    return { alvo: be.breakEvenRevenue, margem: (be.fixedCosts / be.breakEvenRevenue) * 100 };
  });

  /** Por que não há ponto de equilíbrio a mostrar (sem vendas, sem custos fixos ou sem margem). */
  protected breakEvenSemPonto = computed(() => {
    const d = this.data();
    if (!d) return '';
    if (d.current.grossRevenue <= 0)
      return 'Ainda não há vendas neste mês para calcular o ponto de equilíbrio.';
    if (d.breakEven.fixedCosts <= 0 && (d.breakEven.contributionMarginPct ?? 0) > 0)
      return 'Não há custos fixos lançados neste mês, então qualquer venda já cobre as contas.';
    return `Neste mês, os custos variáveis consomem toda a venda: não sobra margem para cobrir os custos fixos de ${formatBRL(d.breakEven.fixedCosts)}, então não há ponto de equilíbrio.`;
  });

  protected readonly breakEvenHint =
    'Quanto você precisa vender no mês só para pagar as contas, sem lucro nem prejuízo. Ponto de equilíbrio = custos fixos ÷ margem de contribuição, que é a parte de cada real vendido que sobra depois dos impostos e dos custos variáveis.';

  /** Regime em uso, para a janela marcar a opção atual (reteste 18/11, item 2). */
  protected regimeAtual = computed(() => this.data()?.tax.regime ?? null);

  async setRegime(regime: TaxRegimeKey): Promise<void> {
    const trocando = !!this.data()?.tax.regime;
    this.savingRegime.set(true);
    try {
      await this.restauranteSvc.updateTaxRegime(regime);
      this.regimeOpen.set(false);
      await this.svc.refresh(this.monthQuery(), this.mesesHistorico());
      this.toast.success(
        trocando ? 'Regime tributário alterado.' : 'Regime tributário configurado.',
      );
    } catch {
      this.toast.error('Não foi possível salvar o regime tributário.');
    } finally {
      this.savingRegime.set(false);
    }
  }
}
