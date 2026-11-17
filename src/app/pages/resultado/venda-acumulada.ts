/**
 * Venda acumulada do mês contra o ponto de equilíbrio (relatório Sweetie Bel, P.9 / tabela 13.3). Pura (testada sem
 * tela). As vendas seguem a regra do Resultado na API: entradas não canceladas, pela data da venda, sem as de
 * categoria não operacional nem as do sistema (transferência, saldo inicial).
 */

export interface VendaDoDia {
  /** "AAAA-MM-DD". */
  date: string;
  gross: number;
}

export interface PontoAcumulado {
  dia: string;
  acumulado: number;
  equilibrio: number;
}

export interface VendaAcumulada {
  pontos: PontoAcumulado[];
  /** Total vendido até o último dia mostrado. */
  vendido: number;
  /** Dia em que a venda acumulada passou do ponto de equilíbrio (null = ainda não passou). */
  cruzouNoDia: number | null;
  /** Só no mês em andamento, sem ter cruzado: em que dia cruza no ritmo atual (null = não cruza neste mês). */
  previsaoDia: number | null;
  /** Ritmo médio por dia até hoje. */
  ritmoDia: number;
  /** No mês em andamento, quanto ainda falta vender até o equilíbrio (0 se já passou). */
  falta: number;
  /** Quantos dias o mês tem e até que dia a linha vai (hoje, no mês em andamento). */
  diasNoMes: number;
  ateDia: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

export function diasNoMes(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * @param month "AAAA-MM" do Resultado.
 * @param hoje "AAAA-MM-DD"; no mês em andamento a linha para nele.
 */
export function vendaAcumulada(
  vendas: VendaDoDia[],
  month: string,
  equilibrio: number,
  hoje: string,
): VendaAcumulada {
  const total = diasNoMes(month);
  const emAndamento = hoje.slice(0, 7) === month;
  const futuro = hoje.slice(0, 7) < month;
  const ateDia = futuro ? 0 : emAndamento ? Number(hoje.slice(8, 10)) : total;
  const porDia = new Array<number>(total + 1).fill(0);
  for (const v of vendas) {
    if (v.date.slice(0, 7) !== month) continue;
    porDia[Number(v.date.slice(8, 10))] += v.gross;
  }
  const pontos: PontoAcumulado[] = [];
  let acc = 0;
  let cruzouNoDia: number | null = null;
  for (let d = 1; d <= ateDia; d++) {
    acc = money(acc + porDia[d]);
    if (cruzouNoDia === null && equilibrio > 0 && acc >= equilibrio) cruzouNoDia = d;
    pontos.push({ dia: String(d).padStart(2, '0'), acumulado: acc, equilibrio });
  }
  const ritmoDia = ateDia > 0 ? money(acc / ateDia) : 0;
  let previsaoDia: number | null = null;
  if (emAndamento && cruzouNoDia === null && equilibrio > 0 && ritmoDia > 0) {
    const dia = Math.ceil(equilibrio / ritmoDia);
    previsaoDia = dia <= total ? dia : null;
  }
  return {
    pontos,
    vendido: acc,
    cruzouNoDia,
    previsaoDia,
    ritmoDia,
    falta: money(Math.max(0, equilibrio - acc)),
    diasNoMes: total,
    ateDia,
  };
}
