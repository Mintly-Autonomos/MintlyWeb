import { DreGroup } from 'mintly-lib';
import type { ExpenseItem } from '../../services/custos.service';

/**
 * Grupos de custo dos gráficos de Custos (relatório Sweetie Bel, P.9 / tabela 13.3). Saem do grupo do DRE da
 * categoria e do tipo do item (taxa de app e de maquininha). Pura (testada sem tela).
 */
export type GrupoCusto = 'cmv' | 'pessoal' | 'taxas' | 'impostos' | 'outras';

/**
 * A API só lista as categorias com gasto nos últimos meses: num mês antigo, o que veio de uma categoria sem gasto
 * recente não tem grupo. Fica em `semDetalhe`, para a coluna fechar com o total do mês.
 */
export const SEM_DETALHE = {
  key: 'semDetalhe',
  nome: 'Categorias sem gasto recente',
  cor: 'color-mix(in oklab, var(--muted-foreground) 25%, transparent)',
};

export const GRUPOS: { key: GrupoCusto; nome: string; cor: string }[] = [
  { key: 'cmv', nome: 'CMV (insumos)', cor: 'var(--ocean)' },
  { key: 'pessoal', nome: 'Mão de obra', cor: 'var(--mint)' },
  { key: 'taxas', nome: 'Taxas (apps e maquininha)', cor: 'var(--warning)' },
  { key: 'impostos', nome: 'Impostos', cor: 'color-mix(in oklab, var(--error) 70%, transparent)' },
  {
    key: 'outras',
    nome: 'Outras despesas',
    cor: 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)',
  },
];

export function grupoDe(item: Pick<ExpenseItem, 'kind' | 'dreGroup'>): GrupoCusto {
  if (item.kind === 'platformFee' || item.kind === 'cardFee') return 'taxas';
  if (item.dreGroup === DreGroup.Cmv) return 'cmv';
  if (item.dreGroup === DreGroup.Labor) return 'pessoal';
  if (item.dreGroup === DreGroup.Tax) return 'impostos';
  return 'outras';
}

export type LinhaGrupos = { mes: string; total: number; semDetalhe: number } & Record<
  GrupoCusto,
  number
>;

const money = (n: number) => Math.round(n * 100) / 100;

/** Custo de cada grupo em cada mês do histórico dos itens (o mesmo mês a mês do total da tela). */
export function custosPorGrupo(
  items: Pick<ExpenseItem, 'kind' | 'dreGroup' | 'history'>[],
  totais: { month: string; total: number }[] = [],
): LinhaGrupos[] {
  const meses =
    totais.length > 0 ? totais.map((t) => t.month) : (items[0]?.history.map((h) => h.month) ?? []);
  return meses.map((mes) => {
    const linha = {
      mes,
      total: 0,
      cmv: 0,
      pessoal: 0,
      taxas: 0,
      impostos: 0,
      outras: 0,
      semDetalhe: 0,
    } as LinhaGrupos;
    for (const item of items) {
      const v = item.history.find((h) => h.month === mes)?.amount ?? 0;
      linha[grupoDe(item)] = money(linha[grupoDe(item)] + v);
      linha.total = money(linha.total + v);
    }
    const totalApi = totais.find((t) => t.month === mes)?.total;
    if (totalApi !== undefined && totalApi - linha.total > 0.009) {
      linha.semDetalhe = money(totalApi - linha.total);
      linha.total = totalApi;
    }
    return linha;
  });
}

/** CMV % e custo primário % de cada mês, sobre a receita do mês. Mês sem receita fica de fora. */
export function percentuaisMensais(
  linhas: LinhaGrupos[],
  receita: ReadonlyMap<string, number>,
): { mes: string; cmvPct: number; primePct: number }[] {
  // Mês com parte sem grupo (semDetalhe) não entra: o % sairia menor do que foi.
  return linhas
    .filter((l) => (receita.get(l.mes) ?? 0) > 0 && l.semDetalhe === 0)
    .map((l) => {
      const r = receita.get(l.mes)!;
      return {
        mes: l.mes,
        cmvPct: Math.round((l.cmv / r) * 1000) / 10,
        primePct: Math.round(((l.cmv + l.pessoal) / r) * 1000) / 10,
      };
    });
}
