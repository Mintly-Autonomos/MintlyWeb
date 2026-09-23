import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Headers } from 'mintly-lib';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { WaterfallRow } from '../shared/waterfall-chart.component';

export interface LinhaDRE {
  label: string;
  valor: number;
  anterior: number;
  tipo: 'receita' | 'deducao' | 'subtotal' | 'resultado';
  pctReceita: number;
  explicacao: string;
}

export interface DespesaOperacional {
  nome: string;
  valor: number;
  anterior: number;
  tipo: 'fixo' | 'variavel';
  icon: string;
}

export interface MesResultado {
  mes: string;
  lucro: number;
  margem: number;
  receita: number;
}

export interface ResultadoDataset {
  refLabel: string;
  receitaBruta: number;
  impostos: number;
  receitaLiquida: number;
  cmv: number;
  margemBruta: number;
  despesasOperacionais: number;
  lucroLiquido: number;
  margemLiquida: number;
  anterior: {
    refLabel: string;
    receitaBruta: number;
    impostos: number;
    receitaLiquida: number;
    cmv: number;
    margemBruta: number;
    despesasOperacionais: number;
    lucroLiquido: number;
    margemLiquida: number;
  };
  linhasDRE: LinhaDRE[];
  waterfallResultado: WaterfallRow[];
  despesasDetalhe: DespesaOperacional[];
  custosFixos: number;
  custosVariaveis: number;
  margemContribuicaoPct: number;
  pontoEquilibrio: number;
  diasParaEquilibrio: number;
  historico: MesResultado[];
  lucroSpark: number[];
}

function buildDataset(): ResultadoDataset {
  const refLabel = 'Julho/2026';
  const receitaBruta = 58400;
  const impostos = 3504;
  const receitaLiquida = 54896;
  const cmv = 21024;
  const margemBruta = 33872;
  const despesasOperacionais = 27500;
  const lucroLiquido = 6372;
  const margemLiquida = (lucroLiquido / receitaBruta) * 100;

  const anterior = {
    refLabel: 'Junho/2026',
    receitaBruta: 54200,
    impostos: 3252,
    receitaLiquida: 50948,
    cmv: 19985,
    margemBruta: 30963,
    despesasOperacionais: 25863,
    lucroLiquido: 5100,
    margemLiquida: 9.4,
  };

  const pct = (v: number) => (v / receitaBruta) * 100;

  const linhasDRE: LinhaDRE[] = [
    {
      label: 'Receita bruta',
      valor: receitaBruta,
      anterior: anterior.receitaBruta,
      tipo: 'receita',
      pctReceita: 100,
      explicacao:
        'Tudo que você vendeu no mês, no salão e no delivery, antes de qualquer desconto.',
    },
    {
      label: 'Impostos sobre venda',
      valor: -impostos,
      anterior: -anterior.impostos,
      tipo: 'deducao',
      pctReceita: -pct(impostos),
      explicacao: 'O que sai direto do faturamento para o governo (Simples Nacional).',
    },
    {
      label: 'Receita líquida',
      valor: receitaLiquida,
      anterior: anterior.receitaLiquida,
      tipo: 'subtotal',
      pctReceita: pct(receitaLiquida),
      explicacao: 'O que realmente entrou depois dos impostos.',
    },
    {
      label: 'CMV — ingredientes e insumos',
      valor: -cmv,
      anterior: -anterior.cmv,
      tipo: 'deducao',
      pctReceita: -pct(cmv),
      explicacao: 'Quanto custou o que você vendeu: frango, óleo, molhos, bebidas e embalagens.',
    },
    {
      label: 'Margem bruta',
      valor: margemBruta,
      anterior: anterior.margemBruta,
      tipo: 'subtotal',
      pctReceita: pct(margemBruta),
      explicacao: 'O que sobra da venda para pagar todas as contas do restaurante.',
    },
    {
      label: 'Despesas operacionais',
      valor: -despesasOperacionais,
      anterior: -anterior.despesasOperacionais,
      tipo: 'deducao',
      pctReceita: -pct(despesasOperacionais),
      explicacao: 'Pró-labore, aluguel, taxa do iFood, energia, cartão, marketing e contador.',
    },
    {
      label: 'Resultado do mês',
      valor: lucroLiquido,
      anterior: anterior.lucroLiquido,
      tipo: 'resultado',
      pctReceita: pct(lucroLiquido),
      explicacao: 'O que sobrou de verdade no fim das contas.',
    },
  ];

  const waterfallResultado: WaterfallRow[] = [
    { label: 'Receita bruta', value: receitaBruta, kind: 'start' },
    { label: 'Impostos', value: -impostos, kind: 'down' },
    { label: 'CMV', value: -cmv, kind: 'down' },
    { label: 'Despesas', value: -despesasOperacionais, kind: 'down' },
    { label: 'Resultado', value: lucroLiquido, kind: 'end' },
  ];

  const despesasDetalhe: DespesaOperacional[] = [
    { nome: 'Pró-labore', valor: 8000, anterior: 8000, tipo: 'fixo', icon: 'badge' },
    { nome: 'Aluguel', valor: 6000, anterior: 6000, tipo: 'fixo', icon: 'storefront' },
    {
      nome: 'Taxa do iFood',
      valor: 6044,
      anterior: 5480,
      tipo: 'variavel',
      icon: 'delivery_dining',
    },
    {
      nome: 'Utilidades (luz, água, gás)',
      valor: 2200,
      anterior: 1820,
      tipo: 'fixo',
      icon: 'bolt',
    },
    {
      nome: 'Manutenção e limpeza',
      valor: 1400,
      anterior: 1300,
      tipo: 'variavel',
      icon: 'cleaning_services',
    },
    { nome: 'Contador e outros', valor: 1456, anterior: 1235, tipo: 'fixo', icon: 'receipt_long' },
    { nome: 'Taxas de cartão', valor: 1200, anterior: 1128, tipo: 'variavel', icon: 'credit_card' },
    { nome: 'Marketing', valor: 1200, anterior: 900, tipo: 'variavel', icon: 'campaign' },
  ];

  const custosFixos = 15200;
  const custosVariaveis = 29268;
  const margemContribuicaoPct = ((receitaBruta - custosVariaveis) / receitaBruta) * 100;
  const pontoEquilibrio = custosFixos / ((receitaBruta - custosVariaveis) / receitaBruta);
  const diasParaEquilibrio = Math.ceil((pontoEquilibrio / receitaBruta) * 30);

  const historico: MesResultado[] = [
    { mes: 'Fev', lucro: 2980, margem: 6.1, receita: 48800 },
    { mes: 'Mar', lucro: 3640, margem: 7.2, receita: 50600 },
    { mes: 'Abr', lucro: 3120, margem: 6.2, receita: 50300 },
    { mes: 'Mai', lucro: 4480, margem: 8.6, receita: 52100 },
    { mes: 'Jun', lucro: 5100, margem: 9.4, receita: 54200 },
    { mes: 'Jul', lucro: 6372, margem: 10.9, receita: 58400 },
  ];

  return {
    refLabel,
    receitaBruta,
    impostos,
    receitaLiquida,
    cmv,
    margemBruta,
    despesasOperacionais,
    lucroLiquido,
    margemLiquida,
    anterior,
    linhasDRE,
    waterfallResultado,
    despesasDetalhe,
    custosFixos,
    custosVariaveis,
    margemContribuicaoPct,
    pontoEquilibrio,
    diasParaEquilibrio,
    historico,
    lucroSpark: historico.map((h) => h.lucro),
  };
}

@Injectable({ providedIn: 'root' })
export class ResultadoService {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly data = signal<ResultadoDataset | null>(null);
  readonly loading = signal(false);

  private get headers(): Headers {
    return { env: environment.mintlyEnv, authorization: `Bearer ${this.auth.getAccessToken()}` };
  }

  /** Mesmo wrapper autenticado dos outros services (401 -> refresh + retry) — pronto pra quando o endpoint existir. */
  private async call<T>(fn: (headers: Headers) => Promise<T>): Promise<T> {
    try {
      return await fn(this.headers);
    } catch (err) {
      if (this.isUnauthorized(err)) {
        const refreshed = await this.auth.refresh();
        if (refreshed) return await fn(this.headers);
        this.router.navigate(['/auth/sessao-expirada']);
      }
      throw err;
    }
  }

  private isUnauthorized(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { response?: { status?: number } }).response?.status === 401
    );
  }

  /** TODO(API): sem endpoint de DRE/resultado na mintly-lib ainda — mock local no mesmo formato de resposta ({ payload }). */
  private async fetch(): Promise<{ payload: ResultadoDataset }> {
    await new Promise((r) => setTimeout(r, 380));
    return { payload: buildDataset() };
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.call(() => this.fetch());
      this.data.set(response.payload);
    } finally {
      this.loading.set(false);
    }
  }
}
