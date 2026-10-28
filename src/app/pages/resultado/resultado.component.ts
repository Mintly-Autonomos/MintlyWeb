import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CategoryBehavior } from 'mintly-lib';
import { ResultadoService, OpexItem } from '../../services/resultado.service';
import { RestauranteService, TaxRegimeKey } from '../../services/restaurante.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { ButtonComponent } from '../../shared/button.component';
import { ModalComponent } from '../../shared/modal.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import { WaterfallChartComponent, WaterfallRow } from '../../shared/waterfall-chart.component';
import { BarChartComponent, BarSeries } from '../../shared/bar-chart.component';
import { LineChartComponent, LineSeries } from '../../shared/line-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL, fmtMonthLong, fmtMonthShort } from '../../shared/format';

const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const abrev = (v: number) => `${Math.round(v / 1000)}k`;

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
};

@Component({
  selector: 'app-resultado',
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
    WaterfallChartComponent,
    BarChartComponent,
    LineChartComponent,
  ],
  templateUrl: './resultado.component.html',
})
export class ResultadoComponent implements OnInit {
  private svc = inject(ResultadoService);
  private restauranteSvc = inject(RestauranteService);
  private toast = inject(ToastService);

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected pctFmt = pctFmt;
  protected abrev = abrev;
  protected readonly Math = Math;
  protected regimeLabel = REGIME_LABEL;
  protected fmtMonthLong = fmtMonthLong;

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
    return [
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
        explicacao: 'Quanto custou o que você vendeu: frango, óleo, molhos, bebidas e embalagens.',
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
        label: 'Resultado do mês',
        valor: d.current.netProfit,
        tipo: 'resultado',
        pctReceita: pct(d.current.netProfit),
        explicacao: 'O que sobrou de verdade no fim das contas.',
        deltaFraction: d.deltas.netProfit,
      },
    ];
  });

  protected waterfallResultado = computed<WaterfallRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: 'Receita bruta', value: d.current.grossRevenue, kind: 'start' },
      { label: 'Impostos', value: -d.current.taxes, kind: 'down' },
      { label: 'CMV', value: -d.current.cmv, kind: 'down' },
      { label: 'Desp. operacionais', value: -d.current.operatingExpenses, kind: 'down' },
      { label: 'Resultado', value: d.current.netProfit, kind: 'end' },
    ];
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

  protected lucroSeries: BarSeries[] = [{ key: 'lucro', name: 'Lucro', color: 'var(--mint)' }];
  protected margemSeries: LineSeries[] = [{ key: 'margem', name: 'Margem', color: 'var(--ocean)' }];

  protected margemLiquida = computed(() => (this.data()?.current.netMargin ?? 0) * 100);
  protected margemLiquidaAnterior = computed(() => (this.data()?.previous.netMargin ?? 0) * 100);
  protected deltaLucro = computed(() => (this.data()?.deltas.netProfit ?? 0) * 100);
  protected margemContribuicaoPct = computed(
    () => (this.data()?.breakEven.contributionMarginPct ?? 0) * 100,
  );

  ngOnInit(): void {
    this.svc
      .refresh()
      .catch(() => this.toast.error('Não foi possível carregar o resultado do mês.'));
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

  breakEvenPct(): number {
    const d = this.data();
    if (!d || !d.breakEven.breakEvenRevenue) return 0;
    return Math.min(100, (d.breakEven.breakEvenRevenue / d.current.grossRevenue) * 100);
  }

  async setRegime(regime: TaxRegimeKey): Promise<void> {
    this.savingRegime.set(true);
    try {
      await this.restauranteSvc.updateTaxRegime(regime);
      this.regimeOpen.set(false);
      await this.svc.refresh();
      this.toast.success('Regime tributário configurado.');
    } catch {
      this.toast.error('Não foi possível salvar o regime tributário.');
    } finally {
      this.savingRegime.set(false);
    }
  }
}
