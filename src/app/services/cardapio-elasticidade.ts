/**
 * Elasticidade-preço no simulador de preço do prato (relatório Sweetie Bel, P.6 / seção 12.7). Pura.
 *
 *   volume novo = volume atual × (preço novo ÷ preço atual) ^ elasticidade
 *   lucro do prato = (preço − custo) × volume
 *   preço de lucro máximo = custo × e ÷ (e + 1)   (só existe com e < −1; com e ≥ −1, subir sempre dá mais lucro)
 *
 * A elasticidade diz quanto o volume cai quando o preço sobe 1% (−1,8 = cai 1,8%). Ordem usada no simulador:
 *  1. a escolhida no próprio prato ("pouco, médio ou muito sensíveis": −1,2 / −1,8 / −2,5), salva no servidor;
 *  2. a medida no último reajuste (volume das 4 semanas antes contra as 4 depois);
 *  3. a do perfil de venda da categoria (Balcão −2,0, Dia a dia −1,5, Bebida −1,2, Encomenda −1,0), o escolhido
 *     pelo dono ou, sem escolha, o sugerido pelo nome;
 *  4. "Dia a dia".
 */
import {
  DEFAULT_SALES_PROFILE,
  PRICE_SENSITIVITY_ELASTICITY,
  PriceSensitivity,
  SALES_PROFILE_ELASTICITY,
  SALES_PROFILE_LABEL,
  SalesProfile,
  suggestSalesProfile,
} from 'mintly-lib';

export type Sensibilidade = 'pouca' | 'media' | 'muita';
export const ELASTICIDADE: Record<Sensibilidade, number> = {
  pouca: -1.2,
  media: -1.8,
  muita: -2.5,
};
export const SENSIBILIDADES: { key: PriceSensitivity; label: string; desc: string }[] = [
  {
    key: PriceSensitivity.Low,
    label: 'Pouco',
    desc: 'encomenda, bolo de festa, cliente fiel (−1,2)',
  },
  {
    key: PriceSensitivity.Medium,
    label: 'Médio',
    desc: 'doces do balcão, pratos do dia a dia (−1,8)',
  },
  {
    key: PriceSensitivity.High,
    label: 'Muito',
    desc: 'compra por impulso, tem concorrente do lado (−2,5)',
  },
];

export interface ElasticidadeUsada {
  valor: number;
  origem: 'prato' | 'medida' | 'categoria';
  /** Perfil da categoria (quando é ele que vale, ou o que valeria sem a escolha do prato). */
  perfil: SalesProfile;
  perfilSugerido: boolean;
}

/** Elasticidade do prato na ordem: escolha do prato > medida no reajuste > perfil da categoria > dia a dia. */
export function elasticidadeDoPrato(
  prato: { category: string | null; priceSensitivity?: PriceSensitivity | null },
  medida: Medida | null,
  perfisSalvos: { category: string; profile: SalesProfile }[],
): ElasticidadeUsada {
  const salvo = perfisSalvos.find(
    (p) =>
      p.category.toLocaleLowerCase('pt-BR') ===
      (prato.category ?? '').trim().toLocaleLowerCase('pt-BR'),
  );
  const perfil =
    salvo?.profile ??
    (prato.category ? suggestSalesProfile(prato.category) : DEFAULT_SALES_PROFILE);
  const base = { perfil, perfilSugerido: !salvo };
  if (prato.priceSensitivity)
    return {
      ...base,
      valor: PRICE_SENSITIVITY_ELASTICITY[prato.priceSensitivity],
      origem: 'prato',
    };
  if (medida?.ok) return { ...base, valor: medida.elasticidade, origem: 'medida' };
  return { ...base, valor: SALES_PROFILE_ELASTICITY[perfil], origem: 'categoria' };
}

export { SALES_PROFILE_LABEL };
/** Queda de volume a partir da qual o simulador avisa do risco de perder o cliente de vez. */
export const QUEDA_RISCO = 0.3;
/** Janela de comparação da elasticidade medida (4 semanas antes e 4 depois do reajuste). */
export const JANELA_MEDIDA_DIAS = 28;

const money = (n: number) => Math.round(n * 100) / 100;

export function volumeNovo(qtd: number, precoAtual: number, precoNovo: number, e: number): number {
  if (precoAtual <= 0 || precoNovo <= 0) return qtd;
  return qtd * Math.pow(precoNovo / precoAtual, e);
}

export function precoOtimo(custo: number, e: number): number | null {
  if (!(e < -1) || custo <= 0) return null;
  return money((custo * e) / (e + 1));
}

export interface PontoCurva {
  preco: number;
  lucro: number;
  qtd: number;
  /** O volume cai mais de 30% contra o atual. */
  risco: boolean;
}

/** Lucro do mês do prato em cada preço da faixa, de `passo` em `passo`. */
export function curvaLucro(
  p: { price: number; cost: number; soldPerMonth: number },
  e: number,
  faixa: { min: number; max: number; passo: number },
): PontoCurva[] {
  const pontos: PontoCurva[] = [];
  const n = Math.round((faixa.max - faixa.min) / faixa.passo);
  for (let i = 0; i <= n; i++) {
    const preco = money(faixa.min + i * faixa.passo);
    const qtd = volumeNovo(p.soldPerMonth, p.price, preco, e);
    pontos.push({
      preco,
      qtd,
      lucro: money((preco - p.cost) * qtd),
      risco: p.soldPerMonth > 0 && qtd < p.soldPerMonth * (1 - QUEDA_RISCO),
    });
  }
  return pontos;
}

// ── elasticidade medida pelo histórico ──────────────────────────────────
export interface VendaComPreco {
  type: 'income' | 'expense';
  status: string;
  /** Dia da venda, "AAAA-MM-DD". */
  date: string;
  items?: { menuItemId: string; qty: number; unitPrice: number }[];
}

export type Medida =
  | {
      ok: true;
      elasticidade: number;
      /** Dia do reajuste. */
      data: string;
      de: number;
      para: number;
      antes: number;
      depois: number;
    }
  | { ok: false; motivo: string; data?: string };

const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/**
 * Elasticidade do prato no último reajuste: volume das 4 semanas antes contra as 4 semanas depois.
 * `null` = nunca houve reajuste registrado nas vendas. Sem dado confiável, devolve o motivo.
 */
export function elasticidadeMedida(
  vendas: VendaComPreco[],
  pratoId: string,
  hoje: string,
): Medida | null {
  const linhas = vendas
    .filter((v) => v.type === 'income' && v.status !== 'cancelled' && v.date <= hoje)
    .flatMap((v) =>
      (v.items ?? []).filter((i) => i.menuItemId === pratoId).map((i) => ({ date: v.date, ...i })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  // Último dia em que o preço guardado na venda mudou.
  let reajuste: { data: string; de: number; para: number } | null = null;
  for (let i = 1; i < linhas.length; i++) {
    if (Math.abs(linhas[i].unitPrice - linhas[i - 1].unitPrice) > 0.009)
      reajuste = { data: linhas[i].date, de: linhas[i - 1].unitPrice, para: linhas[i].unitPrice };
  }
  if (!reajuste) return null;

  const fimDepois = addDays(reajuste.data, JANELA_MEDIDA_DIAS - 1);
  if (fimDepois > hoje)
    return {
      ok: false,
      data: reajuste.data,
      motivo: 'O último reajuste tem menos de 4 semanas de vendas depois dele.',
    };
  const iniAntes = addDays(reajuste.data, -JANELA_MEDIDA_DIAS);
  const soma = (a: string, b: string) =>
    linhas.filter((l) => l.date >= a && l.date <= b).reduce((s, l) => s + l.qty, 0);
  const antes = soma(iniAntes, addDays(reajuste.data, -1));
  const depois = soma(reajuste.data, fimDepois);
  if (antes < 10)
    return {
      ok: false,
      data: reajuste.data,
      motivo: 'Poucas vendas antes do reajuste para medir.',
    };
  const dPreco = (reajuste.para - reajuste.de) / reajuste.de;
  const dVolume = (depois - antes) / antes;
  const e = dVolume / dPreco;
  if (!(e < 0))
    return {
      ok: false,
      data: reajuste.data,
      motivo:
        'As vendas andaram no mesmo sentido do preço: outra coisa (época do ano, promoção) pesou mais.',
    };
  return {
    ok: true,
    elasticidade: Math.round(Math.max(-5, e) * 100) / 100,
    data: reajuste.data,
    de: reajuste.de,
    para: reajuste.para,
    antes,
    depois,
  };
}
