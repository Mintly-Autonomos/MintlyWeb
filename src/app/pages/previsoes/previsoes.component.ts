import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  PrevisoesService,
  Horizonte,
  METRICAS,
  gerarInsights,
  CARDAPIO,
  QUADRANTES,
  Quadrante,
  quadranteDe,
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
  REF,
  CAIXA_HOJE,
} from '../../services/previsoes.service';
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

type Tab = 'simular' | 'cardapio';

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
  private route = inject(ActivatedRoute);
  protected highlightItem = signal<string | null>(null);

  protected tab = signal<Tab>('simular');
  protected horizonte = signal<Horizonte>(30);
  protected metric = signal<SimMetric>('caixa');
  protected alavancas = signal<Alavancas>(ALAVANCAS_ZERO);
  protected leverAtiva = signal<LeverKey>('volume');

  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected abrev = abrev;
  protected readonly Math = Math;
  protected caixaHoje = CAIXA_HOJE;
  protected metricas = METRICAS;
  protected quadrantes = QUADRANTES;
  protected cardapio = CARDAPIO;
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
  protected sim = computed(() => simular(this.ajustes(), this.horizonte()));
  protected base = computed(() => simular(AJUSTES_ZERO, this.horizonte()));
  protected alterado = computed(() => !isDefault(this.ajustes()));

  protected lucroMes = computed(() => simular(this.ajustes(), 30).resultado.lucro);
  protected lucroMesBase = computed(() => simular(AJUSTES_ZERO, 30).resultado.lucro);

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
    return [
      {
        id: 'caixa',
        sev: r.caixaMinimo < 3000 ? 'risco' : 'positivo',
        icon: r.caixaMinimo < 3000 ? 'report' : 'check_circle',
        titulo:
          r.caixaMinimo < 3000
            ? `Caixa apertado por volta do dia ${r.caixaMinimoLabel.slice(0, 2)}`
            : 'Caixa segue positivo no período',
        frase: `Saldo mais baixo: ${formatBRL(Math.round(r.caixaMinimo))}.`,
        acao: 'Ver fluxo de caixa',
        onAction: () => this.router.navigate(['/fluxo-de-caixa']),
        regra: 'Regra: saldo projetado mínimo abaixo de R$ 3.000 no horizonte selecionado.',
      },
      {
        id: 'bebidas',
        sev: 'oportunidade',
        icon: 'lightbulb',
        titulo: 'Dá para subir o preço',
        frase: 'Veja o mês com o prato a R$ 41.',
        acao: 'Simular isso',
        onAction: () => this.aplicarSugestao('preco', { preco: 41 }),
        regra: 'Regra: margem acima da média e volume abaixo da média (quadrante Potencial).',
      },
      {
        id: 'insumos',
        sev: 'atencao',
        icon: 'warning',
        titulo: 'Ingredientes em alta',
        frase: 'Veja o mês com R$ 200 a mais de custo.',
        acao: 'Simular isso',
        onAction: () => this.aplicarSugestao('custo', { custo: 200 }),
        regra: 'Regra: subcategoria com alta acima de 5% em 3 meses consecutivos.',
      },
      {
        id: 'volume',
        sev: 'positivo',
        icon: 'trending_up',
        titulo: 'Fim de semana puxa as vendas',
        frase: 'Veja o mês com 5 frangos a mais por dia.',
        acao: 'Simular isso',
        onAction: () => this.aplicarSugestao('volume', { volume: 5 }),
        regra: 'Regra: dias com peso acima de 15% do faturamento semanal (média de 8 semanas).',
      },
    ];
  });

  protected cardapioPorQuadrante = computed(() => {
    const groups: Record<Quadrante, typeof CARDAPIO> = {
      estrela: [],
      cavalo: [],
      quebraCabeca: [],
      repensar: [],
    };
    for (const item of this.cardapio) groups[quadranteDe(item)].push(item);
    return groups;
  });

  protected quadranteKeys: Quadrante[] = ['estrela', 'cavalo', 'quebraCabeca', 'repensar'];

  ngOnInit(): void {
    this.svc.refresh().catch(() => this.toast.error('Não foi possível carregar as previsões.'));
    gerarInsights(this.horizonte());

    const params = this.route.snapshot.queryParamMap;
    if (params.get('tab') === 'cardapio') this.tab.set('cardapio');
    const item = params.get('item');
    if (item) {
      this.highlightItem.set(item);
      setTimeout(
        () =>
          document
            .getElementById('cardapio-item-' + item)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        250,
      );
    }
  }

  setTab(t: Tab): void {
    this.tab.set(t);
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
          ? { preco: REF.precoMedio }
          : k === 'custo'
            ? { custo: 0 }
            : { cenario: 'normal' as Cenario }),
    }));
  }

  leverIsDefault(k: LeverKey): boolean {
    return alavancaNoNormal(this.alavancas(), k);
  }

  volumeFmt(v: number): string {
    return v === 0 ? 'igual a hoje' : `${v > 0 ? '+' : '−'}${Math.abs(v)} por dia`;
  }

  custoFmt(v: number): string {
    return v === 0 ? 'igual a hoje' : `${v > 0 ? '+' : '−'}${formatBRL(Math.abs(v))} no mês`;
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
