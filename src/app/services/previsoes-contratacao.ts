/**
 * Recomendação de contratação pela sazonalidade (relatório Sweetie Bel, P.4 / seção 12.5). Pura.
 *
 *   produtividade do mês   = vendas do mês ÷ horas da equipe no mês
 *   produtividade de ref.  = média dos 2 meses mais produtivos (a equipe no limite), entre os últimos 12 fechados
 *   horas necessárias      = vendas previstas do mês ÷ produtividade de referência
 *   reforço                = horas necessárias − horas disponíveis
 *   vale reforçar se       margem de contribuição das vendas extras > custo do reforço
 *   contratar fixo (CLT)   só se o índice ficar acima de 1,15 por 3 meses seguidos; senão, reforço temporário
 *
 * As horas da equipe são a carga semanal do contrato (Minha conta → Restaurante → Equipe), a mesma para os meses
 * passados: se a equipe mudou no meio do ano, a produtividade desses meses fica aproximada.
 */

export interface MesPrevisto {
  /** "AAAA-MM" */
  ym: string;
  /** "Dez/26" */
  mes: string;
  previsto: number;
}

export type Decisao = 'reforcar' | 'nao-compensa' | 'folga' | 'ok';

export interface MesContratacao {
  mes: string;
  previsto: number;
  necessarias: number;
  disponiveis: number;
  /** Horas que faltam (> 0) ou sobram (< 0). */
  reforco: number;
  /** Reforço em diárias de 8 h (arredondado para cima). */
  diarias: number;
  vendasExtras: number;
  lucroExtra: number;
  custoReforco: number;
  /** Índice do mês contra a média mensal dos últimos 12 meses fechados. */
  indice: number | null;
  decisao: Decisao;
}

export interface Contratacao {
  horasSemana: number;
  produtividadeRef: number;
  /** Rótulos dos meses usados como referência ("Mai/26", "Out/26"). */
  mesesRef: string[];
  meses: MesContratacao[];
  /** Índice acima de 1,15 por 3 meses seguidos na previsão: vale avaliar contratação fixa. */
  avaliarFixo: boolean;
}

export const HORAS_DIARIA = 8;
export const INDICE_ALTA = 1.15;
/** Sobra de horas a partir da qual a recomendação é "segurar" (férias, banco de horas). */
export const FOLGA = 0.2;

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const rotulo = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const diasNoMes = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
/** Horas da equipe no mês: carga semanal × semanas do mês. */
export const horasNoMes = (horasSemana: number, ym: string) => (horasSemana * diasNoMes(ym)) / 7;
const r1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * `historico`: vendas por mês FECHADO ("AAAA-MM" → total). Sem equipe, sem 3 meses de histórico ou sem vendas,
 * devolve null (a tela explica o que falta).
 */
export function recomendarContratacao(input: {
  horasSemana: number;
  historico: Record<string, number>;
  previstos: MesPrevisto[];
  /** Fração das vendas que sobra depois do custo variável (0,55 = 55%). */
  margemContrib: number;
  custoHora: number;
}): Contratacao | null {
  const { horasSemana, historico, previstos, custoHora } = input;
  if (!(horasSemana > 0)) return null;
  const fechados = Object.entries(historico)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);
  if (fechados.length < 3) return null;

  const produtividades = fechados
    .map(([ym, v]) => ({ ym, p: v / horasNoMes(horasSemana, ym) }))
    .sort((a, b) => b.p - a.p);
  const ref = produtividades.slice(0, 2);
  const produtividadeRef = ref.reduce((s, x) => s + x.p, 0) / ref.length;
  const mediaMensal = fechados.reduce((s, [, v]) => s + v, 0) / fechados.length;
  const margem = Math.min(1, Math.max(0, input.margemContrib));

  const meses = previstos.map((m): MesContratacao => {
    const disponiveis = horasNoMes(horasSemana, m.ym);
    const necessarias = m.previsto / produtividadeRef;
    const reforco = necessarias - disponiveis;
    const extraH = Math.max(0, reforco);
    const vendasExtras = extraH * produtividadeRef;
    const lucroExtra = vendasExtras * margem;
    const custoReforco = extraH * custoHora;
    let decisao: Decisao = 'ok';
    if (reforco > 0) decisao = lucroExtra > custoReforco ? 'reforcar' : 'nao-compensa';
    else if (-reforco > disponiveis * FOLGA) decisao = 'folga';
    return {
      mes: m.mes,
      previsto: money(m.previsto),
      necessarias: r1(necessarias),
      disponiveis: r1(disponiveis),
      reforco: r1(reforco),
      diarias: extraH > 0 ? Math.ceil(extraH / HORAS_DIARIA) : 0,
      vendasExtras: money(vendasExtras),
      lucroExtra: money(lucroExtra),
      custoReforco: money(custoReforco),
      indice: mediaMensal > 0 ? Math.round((m.previsto / mediaMensal) * 100) / 100 : null,
      decisao,
    };
  });

  let seguidos = 0;
  let avaliarFixo = false;
  for (const m of meses) {
    seguidos = m.indice !== null && m.indice > INDICE_ALTA ? seguidos + 1 : 0;
    if (seguidos >= 3) avaliarFixo = true;
  }

  return {
    horasSemana,
    produtividadeRef: money(produtividadeRef),
    mesesRef: ref.map((x) => rotulo(x.ym)),
    meses,
    avaliarFixo,
  };
}
