import { Component } from '@angular/core';
import { LegalPageComponent, LegalSection } from './legal-page.component';

export const TERMOS_ATUALIZADO_EM = '10 de novembro de 2026';

export const TERMOS_SECOES: LegalSection[] = [
  {
    title: 'Aceitação dos termos',
    paragraphs: [
      'Ao criar uma conta ou usar o Mintly, você declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade. Se não concordar com algum ponto, não crie a conta nem use o serviço.',
      'Quem cria a conta em nome de uma empresa declara ter poderes para aceitar estes termos em nome dela.',
    ],
  },
  {
    title: 'O que é o Mintly',
    paragraphs: [
      'O Mintly é uma plataforma de gestão financeira para bares, restaurantes e outros negócios de alimentação. Com ele você registra entradas e saídas, organiza contas e categorias, acompanha o fluxo de caixa e o resultado, cadastra o cardápio e recebe análises e sugestões.',
      'As análises, previsões e sugestões (inclusive as geradas por inteligência artificial) são apoio à decisão. Elas não substituem a orientação de um contador ou de um consultor financeiro, e a decisão final é sempre sua.',
    ],
  },
  {
    title: 'Cadastro e conta',
    items: [
      'Você deve informar dados verdadeiros e mantê-los atualizados.',
      'Você é responsável por manter a senha em sigilo e por tudo o que acontecer na sua conta. Avise-nos se suspeitar de uso indevido.',
      'Por segurança, o acesso é bloqueado por alguns minutos depois de várias tentativas de login com senha incorreta.',
      'O dono da conta pode convidar funcionários, dentro do limite de pessoas do plano contratado, e responde pelo uso que eles fizerem.',
    ],
  },
  {
    title: 'Assinatura e pagamento',
    paragraphs: [
      'O Mintly funciona por assinatura. Depois de criar a conta, você escolhe o tipo de plano (Básico ou Pro) e o período (1, 3, 6 ou 12 meses) e faz o pagamento. O acesso é liberado quando o pagamento é aprovado e dura até o fim do período contratado.',
      'Os valores e as condições de cada plano são mostrados na tela de assinatura, antes da confirmação. Planos mais longos têm desconto. A renovação automática, quando oferecida, só é ativada se você escolher essa opção e pode ser cancelada por você.',
      'Quando o período termina sem renovação, o acesso aos recursos é suspenso, mas os seus dados continuam guardados para que você possa voltar a assinar.',
    ],
  },
  {
    title: 'Uso permitido',
    paragraphs: [
      'Você concorda em usar o Mintly apenas para fins lícitos e para a gestão do seu próprio negócio. Não é permitido:',
    ],
    items: [
      'tentar acessar contas, dados ou áreas do sistema que não sejam seus;',
      'testar vulnerabilidades, sobrecarregar ou interferir no funcionamento do serviço;',
      'copiar, revender ou redistribuir o serviço sem autorização;',
      'inserir conteúdo ilegal ou que viole direitos de terceiros.',
    ],
  },
  {
    title: 'Seus dados',
    paragraphs: [
      'Os dados que você registra no Mintly (movimentações, contas, categorias, pratos e demais informações do seu negócio) continuam sendo seus. Usamos esses dados apenas para prestar o serviço, como descrito na Política de Privacidade.',
      'Você pode pedir a exclusão da sua conta a qualquer momento, na tela Minha conta. Depois do prazo de confirmação, os dados são apagados, salvo o que formos obrigados a guardar por lei.',
    ],
  },
  {
    title: 'Inteligência artificial',
    paragraphs: [
      'No plano Pro, o Mintly pode usar modelos de inteligência artificial de terceiros para reescrever textos de avisos e sugerir ajustes de preço de pratos. Para isso, enviamos ao provedor apenas os números e nomes necessários para a resposta, sem seus dados de acesso e sem dados pessoais de clientes.',
      'Os textos gerados podem conter imprecisões. Confira sempre os valores antes de tomar uma decisão. Há um limite diário de uso por restaurante.',
    ],
  },
  {
    title: 'Disponibilidade e suporte',
    paragraphs: [
      'Trabalhamos para manter o Mintly disponível, mas não garantimos funcionamento ininterrupto. Podem ocorrer manutenções, atualizações e instabilidades fora do nosso controle, como falhas de provedores de internet, hospedagem ou pagamento.',
      'Fazemos cópias de segurança dos dados, mas recomendamos que você mantenha também uma cópia das informações que são essenciais para o seu negócio.',
    ],
  },
  {
    title: 'Limitação de responsabilidade',
    paragraphs: [
      'O Mintly é uma ferramenta de apoio e não se responsabiliza por decisões de negócio tomadas com base nas informações exibidas, nem por prejuízos causados por dados inseridos incorretamente, por uso indevido da conta por terceiros que tenham obtido a sua senha ou por indisponibilidade temporária do serviço.',
      'Nada nestes termos exclui direitos que a lei garante ao consumidor.',
    ],
  },
  {
    title: 'Cancelamento e encerramento',
    paragraphs: [
      'Você pode parar de usar o Mintly e cancelar a renovação a qualquer momento. O período já pago continua valendo até o fim.',
      'Podemos suspender ou encerrar contas que violem estes termos, com aviso quando possível.',
    ],
  },
  {
    title: 'Alterações destes termos',
    paragraphs: [
      'Podemos atualizar estes termos para refletir mudanças no serviço ou na lei. Quando a mudança for relevante, avisaremos no aplicativo ou por e-mail. Continuar usando o Mintly depois do aviso significa que você concorda com a nova versão.',
    ],
  },
  {
    title: 'Lei aplicável e contato',
    paragraphs: [
      'Estes termos são regidos pelas leis do Brasil. Dúvidas, pedidos e reclamações podem ser enviados pelo canal de suporte do aplicativo.',
    ],
  },
];

@Component({
  selector: 'app-termos',
  standalone: true,
  imports: [LegalPageComponent],
  template: `
    <app-legal-page
      title="Termos de Uso"
      [updated]="atualizado"
      intro="Estas são as regras para usar o Mintly. Leia com calma: elas explicam o que você pode esperar de nós e o que esperamos de você."
      [sections]="secoes"
      otherLink="/privacidade"
      otherLabel="Ler também a Política de Privacidade"
    />
  `,
})
export class TermosComponent {
  protected atualizado = TERMOS_ATUALIZADO_EM;
  protected secoes = TERMOS_SECOES;
}
