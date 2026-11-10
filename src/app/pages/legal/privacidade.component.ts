import { Component } from '@angular/core';
import { LegalPageComponent, LegalSection } from './legal-page.component';

export const PRIVACIDADE_ATUALIZADO_EM = '10 de novembro de 2026';

export const PRIVACIDADE_SECOES: LegalSection[] = [
  {
    title: 'Quem somos e o que esta política cobre',
    paragraphs: [
      'O Mintly é uma plataforma de gestão financeira para negócios de alimentação. Esta política explica quais dados pessoais tratamos, para quê, com quem os compartilhamos e quais são os seus direitos, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).',
      'No que diz respeito aos dados do seu negócio (movimentações, contas, categorias, pratos), você decide o que registrar e nós tratamos esses dados para prestar o serviço contratado.',
    ],
  },
  {
    title: 'Quais dados coletamos',
    items: [
      'Dados de cadastro: nome, telefone, e-mail, nome do negócio e senha (a senha é guardada de forma protegida, nunca em texto aberto).',
      'Foto de perfil, se você escolher adicionar.',
      'Dados do negócio que você registra: entradas e saídas, contas financeiras, categorias, pratos e preços, planilhas que você importar e as pessoas da equipe que você convidar (nome, e-mail e telefone).',
      'Dados de assinatura e pagamento: plano, período, datas e situação do pagamento. Os dados do cartão ou da conta não passam pelo Mintly: ficam com o provedor de pagamento.',
      'Dados de uso e segurança: registros de acesso, tentativas de login, endereço de IP e informações do aparelho e do navegador, usados para proteger a conta e corrigir falhas.',
    ],
  },
  {
    title: 'Para que usamos os dados',
    items: [
      'Criar e manter a sua conta e liberar o acesso conforme a assinatura.',
      'Prestar o serviço: registrar e organizar as finanças, gerar relatórios, previsões e avisos.',
      'Processar pagamentos e renovações.',
      'Proteger a conta e o sistema contra fraude, acesso indevido e abuso (por exemplo, bloqueando o acesso depois de várias senhas erradas).',
      'Enviar e-mails do serviço, como a redefinição de senha.',
      'Cumprir obrigações legais e exercer direitos em caso de disputa.',
    ],
  },
  {
    title: 'Bases legais',
    paragraphs: [
      'Tratamos os dados para executar o contrato que você faz conosco ao assinar o Mintly, para cumprir obrigações legais, para atender ao nosso legítimo interesse de manter o serviço seguro e, quando for o caso, com o seu consentimento (por exemplo, ao aceitar estes termos e adicionar uma foto). Você pode retirar o consentimento quando quiser.',
    ],
  },
  {
    title: 'Com quem compartilhamos',
    paragraphs: [
      'Não vendemos os seus dados. Compartilhamos apenas o necessário com empresas que nos ajudam a prestar o serviço, que só podem usar os dados para esse fim:',
    ],
    items: [
      'Provedor de pagamento (Mercado Pago), para cobrar a assinatura.',
      'Serviços de hospedagem e banco de dados, onde o sistema roda e os dados ficam guardados.',
      'Serviço de envio de e-mail, para as mensagens do sistema.',
      'Provedores de inteligência artificial (por exemplo, Anthropic ou Google), usados no plano Pro para reescrever textos de avisos e sugerir ajustes de preço. Enviamos apenas os números e os nomes de pratos e categorias necessários, sem dados de acesso e sem dados pessoais de clientes.',
    ],
  },
  {
    title: 'Por quanto tempo guardamos',
    paragraphs: [
      'Guardamos os dados enquanto a sua conta existir. Se a assinatura terminar, os dados continuam guardados para que você possa voltar. Quando você pede a exclusão da conta, os dados são apagados depois do prazo de confirmação, exceto o que a lei nos obriga a manter (por exemplo, registros de pagamento) e o que for necessário para nos defender em disputas.',
    ],
  },
  {
    title: 'Seus direitos',
    paragraphs: ['A LGPD garante a você, entre outros, os direitos de:'],
    items: [
      'confirmar que tratamos os seus dados e acessá-los;',
      'corrigir dados incompletos, inexatos ou desatualizados (grande parte você mesmo corrige na tela Minha conta);',
      'pedir a exclusão dos dados, inclusive excluindo a conta na tela Minha conta;',
      'pedir a portabilidade e a informação sobre com quem compartilhamos;',
      'retirar o consentimento e se opor a um tratamento que considere indevido.',
    ],
  },
  {
    title: 'Segurança',
    paragraphs: [
      'Usamos conexão criptografada (HTTPS), senhas guardadas de forma protegida, controle de acesso por conta e por função, bloqueio temporário depois de várias tentativas de login incorretas e registro de eventos de segurança. Nenhum sistema é 100% invulnerável: se houver um incidente que possa afetar você, avisaremos como a lei determina.',
      'Você também ajuda: use uma senha forte e exclusiva, não a compartilhe e saia da conta em aparelhos que não são seus.',
    ],
  },
  {
    title: 'Cookies e armazenamento no aparelho',
    paragraphs: [
      'Usamos o armazenamento do navegador apenas para o funcionamento do aplicativo: manter você conectado quando você marca “Manter conectado”, lembrar preferências (como o tema claro ou escuro) e proteger a sessão. Não usamos cookies de publicidade.',
    ],
  },
  {
    title: 'Crianças e adolescentes',
    paragraphs: [
      'O Mintly é voltado a pessoas maiores de 18 anos que administram um negócio. Não coletamos dados de menores de forma intencional.',
    ],
  },
  {
    title: 'Mudanças nesta política',
    paragraphs: [
      'Podemos atualizar esta política. Quando a mudança for relevante, avisaremos no aplicativo ou por e-mail. A data da última atualização fica no topo desta página.',
    ],
  },
  {
    title: 'Fale com a gente',
    paragraphs: [
      'Para exercer os seus direitos ou tirar dúvidas sobre esta política, use o canal de suporte do aplicativo. Você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).',
    ],
  },
];

@Component({
  selector: 'app-privacidade',
  standalone: true,
  imports: [LegalPageComponent],
  template: `
    <app-legal-page
      title="Política de Privacidade"
      [updated]="atualizado"
      intro="Aqui explicamos, sem juridiquês demais, como o Mintly cuida dos seus dados pessoais e dos dados do seu negócio."
      [sections]="secoes"
      otherLink="/termos"
      otherLabel="Ler também os Termos de Uso"
    />
  `,
})
export class PrivacidadeComponent {
  protected atualizado = PRIVACIDADE_ATUALIZADO_EM;
  protected secoes = PRIVACIDADE_SECOES;
}
