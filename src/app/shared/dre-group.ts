import type { DreGroupKey } from '../services/categorias.service';

export interface DreGroupOption {
  value: DreGroupKey;
  /** Nome para o dono, sem jargão contábil. */
  label: string;
  /** Rótulo curto para a lista de categorias. */
  short: string;
  description: string;
}

/**
 * Onde a despesa entra no resultado. O imposto não aparece aqui de propósito: ele vem do regime
 * tributário e a categoria "Impostos" do sistema já fica fora do DRE.
 */
export const DRE_GROUP_OPTIONS: DreGroupOption[] = [
  {
    value: 'cmv',
    label: 'Ingredientes e insumos (CMV)',
    short: 'CMV',
    description: 'Comida, bebida e embalagem que viram prato. Entra no CMV e no custo primário.',
  },
  {
    value: 'labor',
    label: 'Mão de obra',
    short: 'Mão de obra',
    description: 'Salário, pró-labore e encargos. Entra no custo primário, não no CMV.',
  },
  {
    value: 'opex',
    label: 'Despesa operacional',
    short: 'Despesa operacional',
    description: 'Aluguel, luz, marketing, contador e o resto do dia a dia.',
  },
];

const TAX_OPTION: DreGroupOption = {
  value: 'tax',
  label: 'Imposto (calculado pelo regime)',
  short: 'Imposto',
  description: 'Fica fora das despesas: o imposto vem do regime tributário.',
};

/** Opções do seletor; "Imposto" só aparece quando a categoria já está nesse grupo. */
export function dreGroupOptionsFor(current: DreGroupKey | undefined): DreGroupOption[] {
  return current === 'tax' ? [...DRE_GROUP_OPTIONS, TAX_OPTION] : DRE_GROUP_OPTIONS;
}

export function dreGroupShort(group: DreGroupKey | undefined): string {
  const g = group ?? 'opex';
  return [...DRE_GROUP_OPTIONS, TAX_OPTION].find((o) => o.value === g)!.short;
}

/** Começos de palavra que indicam ingrediente/insumo (batem com plural: "fornecedores"). */
const CMV_STEMS = [
  'fornecedor',
  'insumo',
  'ingrediente',
  'hortifruti',
  'verdura',
  'legume',
  'carne',
  'frango',
  'peixe',
  'embalagem',
  'descartavel',
  'bebida',
  'tempero',
  'mercadoria',
  'laticinio',
  'acougue',
];

/**
 * O nome parece de ingrediente ou insumo? Só para sugerir (nunca decide): compara os começos das
 * palavras do nome, já sem acento e em minúsculas.
 */
export function sugereCmv(nome: string): boolean {
  const palavras = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return palavras.some((p) => CMV_STEMS.some((s) => p.startsWith(s)));
}
