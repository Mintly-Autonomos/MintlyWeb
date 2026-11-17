/**
 * Textos do "?" de cada número e gráfico (relatório Sweetie Bel, P.1): o que é e **como se calcula**. Um texto
 * só por indicador, para as telas não divergirem. Quem mudar uma conta no back atualiza o texto aqui.
 */

const calc = (definicao: string, formula: string) => `${definicao} Como se calcula: ${formula}`;

export const CMV_HINT = calc(
  'Custo da Mercadoria Vendida: quanto dos seus insumos (ingredientes, bebidas, embalagens) foi consumido para gerar as vendas. O ideal fica entre 28% e 35% da receita.',
  'soma das despesas das categorias do grupo CMV no mês ÷ receita bruta do mês.',
);

export const PRIME_COST_HINT = calc(
  'Custo primário: o custo dos ingredientes (CMV) somado a toda a mão de obra (salários, encargos e pró-labore). É o maior custo que dá para controlar num negócio de alimentação; o ideal fica até 65% da receita.',
  '(CMV + despesas das categorias do grupo Pessoal) ÷ receita bruta do mês.',
);

export const METRIC_HINTS = {
  // ── Resultado e Visão geral (por competência: a data do lançamento) ──
  receitaBrutaMes: calc(
    'Tudo o que você vendeu no mês (salão, delivery e encomendas), antes de taxas e impostos.',
    'soma das entradas de venda pela data da venda. Empréstimo, aporte, saldo inicial e transferência entre contas não entram.',
  ),
  lucroMes: calc(
    'O que a operação deixou no mês.',
    'receita bruta − impostos sobre a venda − CMV − despesas operacionais. Empréstimo, aporte e compra de equipamento ficam de fora.',
  ),
  margemBruta: calc(
    'O que sobra da venda para pagar as outras contas do negócio.',
    'receita líquida (receita bruta − impostos sobre a venda) − CMV.',
  ),
  despesasOperacionais: calc(
    'Tudo o que a operação gastou no mês fora o CMV e os impostos sobre a venda: pessoal, aluguel, contas de consumo, taxas dos apps e da maquininha, marketing e contador.',
    'soma dessas despesas pela data do lançamento.',
  ),
  margemLiquida: calc(
    'Quanto de cada R$ 100 vendidos virou lucro.',
    'resultado do mês ÷ receita bruta × 100.',
  ),
  cascataResultado: calc(
    'Das vendas até o lucro, uma linha por etapa: cada barra começa onde a anterior terminou, e o que fica à esquerda do traço do zero é prejuízo. O % é sobre as vendas.',
    'vendas − impostos sobre a venda − taxas − CMV − mão de obra − outras despesas = resultado do mês (na Visão geral, taxas e mão de obra ficam dentro das despesas operacionais).',
  ),
  historicoResultado: calc(
    'O lucro de cada mês (barras) e a margem (linha).',
    'margem = resultado do mês ÷ receita bruta do mesmo mês × 100.',
  ),
  receitaVsCustos: calc(
    'A receita e os custos de cada mês, lado a lado.',
    'receita bruta do mês contra a soma de custos e despesas do mês (o mesmo total da tela Custos).',
  ),

  // ── Caixa (pela data em que o dinheiro entra ou sai) ──
  caixaHoje: calc(
    'Quanto há hoje nas suas contas.',
    'soma do saldo atual das contas ativas (bancos, caixa, carteiras e plataformas).',
  ),
  projecao30: calc(
    'Quanto deve haver em caixa daqui a 30 dias, só com o que já está lançado. É o mesmo número do Fluxo de caixa; as Previsões somam também o ritmo de vendas e custos.',
    'caixa hoje + a receber − a pagar nos próximos 30 dias.',
  ),
  aReceber: calc(
    'Entradas já lançadas que ainda não caíram na conta (as atrasadas entram).',
    'soma das entradas pendentes com vencimento até o fim do período escolhido.',
  ),
  aPagar: calc(
    'Contas já lançadas que ainda não foram pagas (as vencidas entram).',
    'soma das saídas pendentes com vencimento até o fim do período escolhido.',
  ),
  saldoPrevisto: calc(
    'Quanto deve sobrar em caixa no fim do período escolhido, só com o que já está lançado.',
    'caixa hoje + a receber − a pagar.',
  ),
  entradasSaidas: calc(
    'O que entra e o que sai em cada semana do período.',
    'soma das entradas e das saídas pendentes com vencimento em cada semana.',
  ),

  // ── Receitas (pela data em que o dinheiro entrou) ──
  receitaBrutaRecebida: calc(
    'Tudo o que entrou de vendas no período, antes de taxas e impostos.',
    'soma das vendas já recebidas no período, pela data em que o dinheiro entrou.',
  ),
  receitaLiquida: calc(
    'O que sobra da venda depois das taxas e dos impostos.',
    'receita bruta − taxas dos apps e da maquininha − impostos sobre a venda (pelo regime tributário do restaurante).',
  ),
  ticketMedio: calc(
    'Quanto cada venda deixa, em média. Num fechamento do dia, informe quantas vendas ele soma no campo "Quantas vendas"; sem isso, cada lançamento conta como uma venda.',
    'receita bruta ÷ número de vendas.',
  ),
  vendas: calc(
    'Quantas vendas houve no período.',
    'soma do campo "Quantas vendas" de cada lançamento; lançamento sem esse número conta como 1.',
  ),
  brutaLiquida: calc(
    'Quanto de cada R$ 100 vendidos fica com você, e quanto vai para taxas e impostos.',
    'fica com você = receita bruta − taxas dos apps e da maquininha − impostos sobre a venda; cada parte ÷ receita bruta × 100.',
  ),
  itensMaisVendidos: calc(
    'Os pratos que mais faturaram, mais saíram ou mais deram lucro no período.',
    'receita = preço do prato no dia da venda × quantidade; lucro = (preço − custo atual do prato no cardápio) × quantidade. Só entram as vendas com os pratos informados; no lucro, só os pratos que têm custo.',
  ),
  receitaPorCategoria: calc(
    'Como a receita se divide entre as categorias de venda.',
    'soma das vendas de cada categoria no período; as 5 maiores aparecem e o resto vira "Outras".',
  ),
  canais: calc(
    'Quanto cada canal fatura (barra escura) e quanto sobra depois das taxas (barra verde). No delivery, o app cobra comissão.',
    'receita do canal; líquida = receita do canal − taxas desse canal − impostos sobre a venda.',
  ),
  formasPagamento: calc(
    'Como seus clientes pagaram e quanto cada forma custou em taxa.',
    'soma das vendas por forma de pagamento no período; o % é (bruto − líquido) ÷ bruto, a taxa que a conta cobrou nessas vendas.',
  ),
  tendenciaReceita: calc(
    'Como a receita evolui.',
    'soma das vendas por mês nos últimos 12 meses, com o mesmo mês do ano anterior (tracejado) e a média dos últimos 3 meses; em períodos curtos, por dia ou por semana. Em "Por canal", separada em salão, delivery e encomendas.',
  ),

  // ── Custos (por competência) ──
  custosTotal: calc(
    'Tudo o que a operação gastou no mês.',
    'soma das despesas do mês pela data do lançamento, com as taxas dos apps e da maquininha. Empréstimo, compra de equipamento e transferência entre contas ficam de fora.',
  ),
  taxaPlataforma: calc(
    'A comissão que os apps de delivery (iFood, Rappi...) cobram sobre as vendas deles. A taxa da maquininha fica separada, embaixo do valor.',
    'soma das comissões das contas de app no mês; o % é sobre o que foi vendido por esses apps.',
  ),
  evolucaoCustos: calc(
    'Se os custos estão subindo mês a mês, e em qual categoria.',
    'soma de custos e despesas de cada mês; em "Por categoria", as 5 maiores categorias.',
  ),
} as const;

export type MetricHintKey = keyof typeof METRIC_HINTS;
