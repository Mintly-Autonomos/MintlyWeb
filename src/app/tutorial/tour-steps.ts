/**
 * Passos do tutorial ("?" no cabeçalho). Cada passo aponta para um elemento marcado na tela com
 * `data-tour="<alvo>"`. Passo cujo alvo não está na tela agora (escondido no celular, estado vazio, etc.)
 * é pulado, então a lista pode ser a mesma em qualquer largura.
 */
export interface TourStep {
  /** Valor do atributo `data-tour` do elemento destacado. */
  target: string;
  title: string;
  text: string;
}

const periodoMes: TourStep = {
  target: 'periodo',
  title: 'Escolha o mês',
  text: 'Troque entre este mês, o mês passado ou um mês específico. Todos os números e gráficos da página mudam junto.',
};

/** Passos de cada página, pelo primeiro trecho da rota (ex.: `/visao-geral` → `visao-geral`). */
export const PAGE_STEPS: Record<string, TourStep[]> = {
  'visao-geral': [
    periodoMes,
    {
      target: 'saude',
      title: 'Saúde financeira',
      text: 'Uma nota de 0 a 100 que resume como está seu negócio: lucro, controle de custos, fôlego de caixa e tendência de vendas. Clique no cartão para ver como ela é calculada.',
    },
    {
      target: 'grafico-receita-custos',
      title: 'Receita vs. custos',
      text: 'Compara o que entrou com o que saiu nos últimos 6 meses e mostra a projeção do mês atual. Quando os custos passam da receita, o mês fecha no prejuízo.',
    },
    {
      target: 'acoes',
      title: 'Atalhos do dia a dia',
      text: 'Registre uma venda ou uma despesa em um toque, ou abra o relatório do mês (a tela Resultado).',
    },
  ],
  'fluxo-de-caixa': [
    {
      target: 'periodo',
      title: 'Horizonte da projeção',
      text: 'Escolha quantos dias à frente quer enxergar (30, 60, 90 ou um período seu). Vale para a página inteira.',
    },
    {
      target: 'projecao',
      title: 'Projeção de caixa',
      text: 'Mostra como seu saldo deve evoluir com as contas que você já lançou: o que vai entrar e o que vai sair.',
    },
    {
      target: 'entradas-saidas',
      title: 'Entradas vs. saídas',
      text: 'Compara, período a período, quanto entra e quanto sai. Ajuda a ver em qual semana o caixa aperta.',
    },
    {
      target: 'vencimentos',
      title: 'Próximos vencimentos',
      text: 'A lista do que vence nos próximos dias. Filtre por “A receber”, “A pagar” ou “Vencidos” para saber o que cobrar e o que pagar primeiro.',
    },
  ],
  receitas: [
    {
      target: 'periodo',
      title: 'Período',
      text: 'Veja suas receitas de hoje, dos últimos 7 dias, do mês, do mês passado ou de um intervalo seu.',
    },
    {
      target: 'kpis',
      title: 'Números principais',
      text: 'Receita bruta, o que sobra depois das taxas, ticket médio e número de vendas, cada um comparado com o período anterior.',
    },
    {
      target: 'quando-vende',
      title: 'Quando você mais vende',
      text: 'Um mapa por dia da semana e horário: quanto mais escuro o quadrado, mais você vende naquele momento. Conta as vendas com a hora informada no lançamento. Use para planejar equipe e compras.',
    },
  ],
  custos: [
    periodoMes,
    {
      target: 'fique-de-olho',
      title: 'Fique de olho',
      text: 'Gastos que fugiram do padrão dos últimos meses. Clique em “Ver detalhes” para entender o que mudou.',
    },
    {
      target: 'para-onde',
      title: 'Para onde está indo seu dinheiro',
      text: 'Cada categoria de custo com o valor, o peso na receita e se está subindo ou caindo. Filtre por variáveis ou fixos e compare com o mês anterior ou com a média de 3 meses.',
    },
    {
      target: 'evolucao',
      title: 'Evolução dos custos',
      text: 'Os últimos 6 meses de custos e despesas, no total ou por categoria.',
    },
  ],
  resultado: [
    periodoMes,
    {
      target: 'como-calcula',
      title: 'Como o número é calculado',
      text: 'Abre uma explicação simples de cada linha do resultado, sem jargão contábil.',
    },
    {
      target: 'leitura',
      title: 'Leitura do mês',
      text: 'Frases curtas dizendo o que explica o lucro ou o prejuízo do mês.',
    },
    {
      target: 'cascata',
      title: 'Como seu lucro se forma',
      text: 'Do que entrou até o que sobrou, passo a passo: cada barra é uma etapa entre a venda e o lucro.',
    },
    {
      target: 'linha-a-linha',
      title: 'Linha a linha do mês',
      text: 'A mesma conta em formato de tabela (o que o contador chama de DRE). Dá para ver em R$ ou em % da receita.',
    },
    {
      target: 'historico',
      title: 'Últimos 6 meses',
      text: 'As barras mostram o lucro de cada mês e a linha mostra a margem.',
    },
  ],
  previsoes: [
    {
      target: 'periodo',
      title: 'Quantos dias à frente',
      text: 'Escolha o tamanho da projeção: 30, 60 ou 90 dias.',
    },
    {
      target: 'abas',
      title: 'Duas ferramentas',
      text: '“Simular meu negócio”: mexa em vendas, preço e custos e veja o efeito. “Meu cardápio”: simule o preço e a venda de cada prato.',
    },
    {
      target: 'projecao',
      title: 'Sua projeção',
      text: 'Mexa nos controles e veja caixa, lucro e veredito mudarem na hora. Nada é salvo: é só uma simulação.',
    },
    {
      target: 'fique-de-olho',
      title: 'Fique de olho',
      text: 'Alertas curtos gerados das suas projeções. Clique em “Simular isso” para testar uma saída.',
    },
  ],
  movimentacoes: [
    {
      target: 'novo-lancamento',
      title: 'Registrar entradas e saídas',
      text: '“Nova entrada” é para uma venda ou outra receita; “Nova saída” é para uma despesa. É daqui que vêm quase todos os números do Mintly.',
    },
    {
      target: 'como-lancar',
      title: 'Passo a passo de um lançamento',
      text: 'Nunca lançou? “Como lançar?” abre o formulário e explica cada campo, na ordem.',
    },
    {
      target: 'resumo',
      title: 'Resumo',
      text: 'O que já foi recebido, o que já foi pago e quanto ainda está pendente (aguardando confirmação).',
    },
    {
      target: 'filtros',
      title: 'Busca e filtros',
      text: 'Procure por título e filtre por tipo, status, período e conta para achar qualquer lançamento.',
    },
    {
      target: 'tabela',
      title: 'Seus lançamentos',
      text: 'Cada linha é uma entrada ou saída, com data, categoria, conta, valor e situação. Use o lápis para editar e o “i” para ver os detalhes.',
    },
  ],
  cardapio: [
    {
      target: 'novo-prato',
      title: 'Cadastrar um prato',
      text: 'Informe preço, custo e categoria. Com isso o Mintly calcula a margem de cada prato.',
    },
    {
      target: 'busca',
      title: 'Buscar prato',
      text: 'Encontre um prato pelo nome ou pela categoria.',
    },
    {
      target: 'tabela',
      title: 'Preço, custo e margem',
      text: 'Veja a margem, quanto cada prato vendeu nos últimos 30 dias e há quanto tempo o preço foi revisado. Em cada linha dá para mudar o preço, editar ou inativar o prato.',
    },
  ],
  contas: [
    {
      target: 'nova-conta',
      title: 'Cadastrar uma conta',
      text: 'Adicione bancos, caixas e carteiras digitais, como o caixa do salão ou a conta do banco.',
    },
    {
      target: 'resumo',
      title: 'Saldos',
      text: 'Saldo atual, saldo previsto (contando o que ainda está pendente) e quantas contas você tem.',
    },
    {
      target: 'filtros',
      title: 'Busca e filtros',
      text: 'Procure uma conta pelo nome e filtre por tipo e situação.',
    },
    {
      target: 'cartoes',
      title: 'Suas contas',
      text: 'Cada cartão é uma conta, com saldo atual e previsto. A estrela marca a conta padrão; use o lápis para editar.',
    },
  ],
  categorias: [
    {
      target: 'nova-categoria',
      title: 'Criar categoria',
      text: 'Crie categorias de receita ou de despesa para organizar suas movimentações do seu jeito.',
    },
    {
      target: 'abas',
      title: 'Receitas e despesas',
      text: 'Alterne entre as categorias de receita e as de despesa. O número mostra quantas existem de cada.',
    },
    {
      target: 'filtros',
      title: 'Busca e filtros',
      text: 'Procure uma categoria pelo nome e filtre pelo que precisar.',
    },
    {
      target: 'tabela',
      title: 'Suas categorias',
      text: 'Cada categoria tem um comportamento (fixa ou variável) e uma natureza (como operacional), que o Mintly usa para calcular custos e resultado.',
    },
  ],
};

/** Passos comuns a todas as páginas (menu e cabeçalho), no fim do tutorial. */
export const COMMON_STEPS: TourStep[] = [
  {
    target: 'menu-lateral',
    title: 'Menu principal',
    text: 'Aqui ficam todas as telas do Mintly. A tela em que você está aparece destacada.',
  },
  {
    target: 'menu-celular',
    title: 'Menu',
    text: 'Toque aqui para abrir o menu com todas as telas do Mintly.',
  },
  {
    target: 'notificacoes',
    title: 'Avisos',
    text: 'O sino mostra avisos importantes, como prato com preço parado há muito tempo e o vencimento da assinatura.',
  },
  {
    target: 'conta',
    title: 'Sua conta',
    text: 'Aqui ficam “Minha conta” (seus dados, foto e senha; se você é o dono, também o restaurante e os funcionários), sua assinatura e a saída da conta.',
  },
  {
    target: 'ajuda',
    title: 'Quer rever?',
    text: 'Clique no “?” sempre que quiser ver o tutorial da tela em que estiver.',
  },
];

/**
 * Passo a passo de como criar uma movimentação: percorre o formulário de "Nova entrada" campo a campo. Começa
 * pelo botão "Como lançar?" de Movimentações. Os campos que não aparecem (ex.: pratos numa saída) são pulados.
 */
export const LANCAMENTO_STEPS: TourStep[] = [
  {
    target: 'mov-tipo',
    title: '1. Entrada ou saída',
    text: 'Entrada é dinheiro que chega (uma venda, por exemplo). Saída é dinheiro que vai (uma conta, um fornecedor). Dá para trocar aqui a qualquer momento.',
  },
  {
    target: 'mov-titulo',
    title: '2. Um nome para achar depois',
    text: 'Algo curto que você reconheça na lista, como “Vendas do almoço” ou “Boleto da Coca-Cola”.',
  },
  {
    target: 'mov-pratos',
    title: '3. Pratos vendidos (opcional)',
    text: 'Se quiser, escolha os pratos e as quantidades: o valor é somado sozinho e o Mintly mostra o que mais vende. Pode pular.',
  },
  {
    target: 'mov-valor',
    title: '4. Quanto',
    text: 'O valor cheio, antes de qualquer taxa. Digite os centavos depois da vírgula (ex.: 1.234,50).',
  },
  {
    target: 'mov-data',
    title: '5. Quando aconteceu',
    text: 'O dia da venda ou da despesa. É por essa data que o lançamento entra no mês certo do Resultado.',
  },
  {
    target: 'mov-categoria',
    title: '6. Que tipo de dinheiro é',
    text: 'A categoria diz de onde vem ou para onde vai o dinheiro (venda no balcão, aluguel, insumos…). É ela que monta os relatórios.',
  },
  {
    target: 'mov-conta',
    title: '7. Onde o dinheiro está',
    text: 'Em qual conta o dinheiro entrou ou saiu: caixa, banco, maquininha ou app de delivery. Em maquininha e app, o Mintly calcula a taxa e a data do repasse.',
  },
  {
    target: 'mov-forma',
    title: '8. Como foi pago',
    text: 'Pix, dinheiro, débito, crédito… Na maquininha, cada forma pode ter uma taxa diferente.',
  },
  {
    target: 'mov-status',
    title: '9. Já caiu na conta?',
    text: 'Recebido ou pago: o dinheiro já mexeu. Pendente: ainda vai entrar ou sair (boleto, repasse do app). O pendente aparece no Fluxo de caixa.',
  },
  {
    target: 'mov-venda',
    title: '10. Canal, hora e número de vendas (opcional)',
    text: 'Salão, delivery ou encomenda; a hora mostra quando você mais vende; e, num fechamento do dia, quantas vendas ele soma deixa o ticket médio certo.',
  },
  {
    target: 'mov-obs',
    title: '11. Observações (opcional)',
    text: 'Qualquer detalhe que ajude depois: número do pedido, nome do cliente, nota fiscal.',
  },
  {
    target: 'mov-registrar',
    title: '12. Pronto',
    text: 'Com os campos obrigatórios preenchidos, o botão libera. Ele mostra o que falta enquanto estiver bloqueado.',
  },
];

/** Primeiro trecho da rota: `/movimentacoes?x=1#a` → `movimentacoes`. */
export function pageKey(url: string): string {
  return url.split(/[?#]/)[0].split('/').filter(Boolean)[0] ?? '';
}

/** Passos da página (se houver) seguidos dos comuns. */
export function stepsForPage(url: string): TourStep[] {
  return [...(PAGE_STEPS[pageKey(url)] ?? []), ...COMMON_STEPS];
}
