import { signal } from '@angular/core';
import { SUBSCRIPTION_MEMBER_LIMIT } from 'mintly-lib';
import { TestBed } from '@angular/core/testing';
import { MinhaContaComponent, senhaForte } from './minha-conta.component';
import { AuthService } from '../../services/auth.service';
import { ContaDados, ContaService, Membro } from '../../services/conta.service';
import { ToastService } from '../../shared/toast.service';

const dono: ContaDados = {
  nome: 'Davi Lee',
  email: 'davi@teste.com',
  telefone: '11999990000',
  papel: 'owner',
};
const funcionario: ContaDados = { ...dono, nome: 'Ana', papel: 'member' };

const membro = (over: Partial<Membro> = {}): Membro => ({
  id: 'm1',
  nome: 'Ana Garçom',
  email: 'ana@teste.com',
  status: 'active',
  perfil: 'operations',
  ...over,
});

describe('senhaForte', () => {
  it('8+ caracteres com maiúscula, minúscula e número', () => {
    expect(senhaForte('Senha123')).toBe(true);
    expect(senhaForte('curta1A')).toBe(false);
    expect(senhaForte('semmaiuscula1')).toBe(false);
    expect(senhaForte('SEMMINUSCULA1')).toBe(false);
    expect(senhaForte('SemNumeroAqui')).toBe(false);
  });
});

describe('MinhaContaComponent', () => {
  function render(
    over: {
      dados?: ContaDados;
      membros?: Membro[];
      equipe?: { nome: string; horasSemana: number }[] | null;
      exclusaoEm?: string | null;
      lento?: boolean;
      tier?: 'basic' | 'pro' | null;
      foto?: string;
    } = {},
  ) {
    let liberar: () => void = () => undefined;
    const dados = signal<ContaDados | null>(null);
    const restaurante = signal('Cantina');
    const membros = signal<Membro[]>(over.membros ?? []);
    const exclusaoPedidaEm = signal<string | null>(over.exclusaoEm ?? null);
    const equipe = signal(over.equipe ?? null);
    const svc = {
      dados,
      restaurante,
      membros,
      equipe,
      exclusaoPedidaEm,
      salvarEquipe: vi.fn((l: { nome: string; horasSemana: number }[]) =>
        Promise.resolve(equipe.set(l)),
      ),
      carregarConta: vi.fn(() =>
        over.lento
          ? new Promise<void>((resolve) => {
              liberar = () => {
                dados.set(over.dados ?? dono);
                resolve();
              };
            })
          : Promise.resolve(dados.set(over.dados ?? dono)),
      ),
      carregarRestaurante: vi.fn(() => Promise.resolve()),
      carregarMembros: vi.fn(() => Promise.resolve()),
      salvarDados: vi.fn(() => Promise.resolve()),
      trocarEmail: vi.fn(() => Promise.resolve()),
      trocarSenha: vi.fn(() => Promise.resolve()),
      renomearRestaurante: vi.fn(() => Promise.resolve()),
      adicionarMembro: vi.fn(() => Promise.resolve()),
      atualizarMembro: vi.fn(() => Promise.resolve()),
      reenviarConvite: vi.fn(() => Promise.resolve()),
      excluirMembro: vi.fn(() => Promise.resolve()),
      pedirExclusao: vi.fn(() => Promise.resolve()),
      cancelarExclusao: vi.fn(() => Promise.resolve()),
    };
    const toast = { success: vi.fn(), error: vi.fn() };
    const currentUser = signal<{ avatarDataUrl?: string } | null>({ avatarDataUrl: over.foto });
    const auth = {
      currentUser,
      subscriptionState: () => ({ tier: over.tier === undefined ? 'basic' : over.tier }),
      updateAvatar: vi.fn((url: string) =>
        Promise.resolve(currentUser.set({ avatarDataUrl: url })),
      ),
      removeAvatar: vi.fn(() => Promise.resolve(currentUser.set({}))),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ContaService, useValue: svc },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(MinhaContaComponent);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentRef.setInput('open', true);
    const root = fixture.nativeElement as HTMLElement;
    const q = <T extends HTMLElement = HTMLElement>(id: string) =>
      root.querySelector<T>(`[data-testid="${id}"]`);
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const type = async (id: string, value: string) => {
      const el = q<HTMLInputElement>(id)!;
      el.value = value;
      el.dispatchEvent(new Event('input'));
      await settle();
    };
    const click = async (id: string) => {
      q<HTMLButtonElement>(id)!.click();
      await settle();
    };
    return {
      fixture,
      root,
      svc,
      auth,
      toast,
      closed,
      q,
      text,
      settle,
      type,
      click,
      liberar: () => liberar(),
    };
  }

  describe('quem é o dono e quem é funcionário', () => {
    it('dono vê as duas abas (Meus dados e Restaurante)', async () => {
      const { q, settle } = render();
      await settle();
      expect(q('aba-dados')).not.toBeNull();
      expect(q('aba-restaurante')).not.toBeNull();
    });

    it('funcionário só vê os próprios dados: sem abas e sem nada do restaurante', async () => {
      const { q, settle, svc } = render({ dados: funcionario });
      await settle();
      expect(q('aba-restaurante')).toBeNull();
      expect(q('secao-dados')).not.toBeNull();
      expect(q('secao-funcionarios')).toBeNull();
      expect(q('secao-exclusao')).toBeNull();
      expect(svc.carregarMembros).not.toHaveBeenCalled();
      expect(svc.carregarRestaurante).not.toHaveBeenCalled();
    });

    it('mostra o e-mail e mensagem de carregando enquanto os dados não chegam', async () => {
      const { fixture, text, settle, liberar } = render({ lento: true });
      fixture.detectChanges();
      expect(text()).toContain('Carregando sua conta');
      liberar();
      await settle();
      expect(text()).toContain('davi@teste.com');
    });
  });

  describe('Meus dados', () => {
    it('vem preenchido e só deixa salvar depois de mudar algo válido', async () => {
      const { q, settle, type } = render();
      await settle();
      expect(q<HTMLInputElement>('campo-nome')!.value).toBe('Davi Lee');
      expect(q<HTMLInputElement>('campo-telefone')!.value).toBe('11999990000');
      expect(q<HTMLButtonElement>('salvar-dados')!.disabled).toBe(true);

      await type('campo-nome', 'D');
      expect(q<HTMLButtonElement>('salvar-dados')!.disabled).toBe(true);
      await type('campo-nome', 'Davi L. Lee');
      expect(q<HTMLButtonElement>('salvar-dados')!.disabled).toBe(false);
    });

    it('salva só o que mudou', async () => {
      const { svc, toast, type, click, settle } = render();
      await settle();
      await type('campo-telefone', '11988887777');
      await click('salvar-dados');
      expect(svc.salvarDados).toHaveBeenCalledWith({ telefone: '11988887777' });
      expect(toast.success).toHaveBeenCalled();
    });

    it('troca de e-mail: formulário fechado até pedir; exige e-mail válido e a senha atual', async () => {
      const { q, svc, click, type, settle } = render();
      await settle();
      expect(q('campo-novo-email')).toBeNull();
      await click('abrir-email');
      expect(q<HTMLButtonElement>('trocar-email')!.disabled).toBe(true);

      await type('campo-novo-email', 'isto-nao-e-email');
      await type('campo-senha-email', 'Senha123');
      expect(q<HTMLButtonElement>('trocar-email')!.disabled).toBe(true);

      await type('campo-novo-email', 'novo@teste.com');
      expect(q<HTMLButtonElement>('trocar-email')!.disabled).toBe(false);
      await click('trocar-email');
      expect(svc.trocarEmail).toHaveBeenCalledWith('novo@teste.com', 'Senha123');
    });

    it('senha errada na troca de e-mail aparece junto do botão e o formulário continua aberto', async () => {
      const { q, svc, click, type, text, settle } = render();
      svc.trocarEmail.mockRejectedValue({
        response: { status: 403, data: { message: 'Senha incorreta.' } },
      });
      await settle();
      await click('abrir-email');
      await type('campo-novo-email', 'novo@teste.com');
      await type('campo-senha-email', 'Errada123');
      await click('trocar-email');
      expect(text()).toContain('Senha incorreta.');
      expect(q('campo-novo-email')).not.toBeNull();
    });

    it('troca de senha: avisa quando a nova é fraca ou as senhas não conferem', async () => {
      const { q, click, type, settle } = render();
      await settle();
      await click('abrir-senha');
      await type('campo-senha-atual', 'Antiga123');
      await type('campo-senha-nova', 'fraca');
      await type('campo-senha-confirma', 'outra');
      expect(q('regra-senha')!.className).toContain('text-warning');
      expect(q('senhas-diferentes')).not.toBeNull();
      expect(q<HTMLButtonElement>('trocar-senha')!.disabled).toBe(true);

      await type('campo-senha-nova', 'NovaSenha456');
      await type('campo-senha-confirma', 'NovaSenha456');
      expect(q('senhas-diferentes')).toBeNull();
      expect(q<HTMLButtonElement>('trocar-senha')!.disabled).toBe(false);
    });

    it('troca de senha: manda a antiga e a nova e fecha o modal (a pessoa vai entrar de novo)', async () => {
      const { svc, closed, click, type, settle } = render();
      await settle();
      await click('abrir-senha');
      await type('campo-senha-atual', 'Antiga123');
      await type('campo-senha-nova', 'NovaSenha456');
      await type('campo-senha-confirma', 'NovaSenha456');
      await click('trocar-senha');
      expect(svc.trocarSenha).toHaveBeenCalledWith('Antiga123', 'NovaSenha456');
      expect(closed).toHaveBeenCalled();
    });

    it('senha atual errada na troca de senha: mostra o erro e NÃO fecha', async () => {
      const { svc, closed, click, type, text, settle } = render();
      svc.trocarSenha.mockRejectedValue({
        response: { status: 403, data: { message: 'Senha incorreta.' } },
      });
      await settle();
      await click('abrir-senha');
      await type('campo-senha-atual', 'Errada123');
      await type('campo-senha-nova', 'NovaSenha456');
      await type('campo-senha-confirma', 'NovaSenha456');
      await click('trocar-senha');
      expect(text()).toContain('Senha incorreta.');
      expect(closed).not.toHaveBeenCalled();
    });
  });

  describe('Restaurante (dono)', () => {
    async function naAbaRestaurante(over: Parameters<typeof render>[0] = {}) {
      const r = render(over);
      await r.settle();
      await r.click('aba-restaurante');
      return r;
    }

    it('equipe (P.4): adiciona pessoas com horas por semana, valida e salva a lista inteira', async () => {
      const { q, svc, type, click, text } = await naAbaRestaurante({
        equipe: [{ nome: 'Dona Bel', horasSemana: 60 }],
      });
      expect(q<HTMLInputElement>('equipe-nome-0')!.value).toBe('Dona Bel');
      expect(q<HTMLButtonElement>('equipe-salvar')!.disabled).toBe(true);
      await click('equipe-adicionar');
      // Sem nome: não deixa salvar.
      expect(q<HTMLButtonElement>('equipe-salvar')!.disabled).toBe(true);
      await type('equipe-nome-1', 'Joana');
      await type('equipe-horas-1', '22,5');
      expect(text()).toContain('Total: 82,5 h por semana');
      await click('equipe-salvar');
      expect(svc.salvarEquipe).toHaveBeenCalledWith([
        { nome: 'Dona Bel', horasSemana: 60 },
        { nome: 'Joana', horasSemana: 22.5 },
      ]);
    });

    it('equipe (P.4): horas fora de 1 a 112 bloqueiam o salvar; remover tira da lista', async () => {
      const { q, type, click } = await naAbaRestaurante({
        equipe: [{ nome: 'Ana', horasSemana: 44 }],
      });
      await type('equipe-horas-0', '200');
      expect(q<HTMLButtonElement>('equipe-salvar')!.disabled).toBe(true);
      await click('equipe-remover-0');
      expect(q('equipe-nome-0')).toBeNull();
      expect(q<HTMLButtonElement>('equipe-salvar')!.disabled).toBe(false);
    });

    it('o nome só pode ser salvo depois de mudar, e salva', async () => {
      const { q, svc, type, click } = await naAbaRestaurante();
      expect(q<HTMLInputElement>('campo-restaurante')!.value).toBe('Cantina');
      expect(q<HTMLButtonElement>('salvar-restaurante')!.disabled).toBe(true);
      await type('campo-restaurante', 'Cantina do Davi');
      await click('salvar-restaurante');
      expect(svc.renomearRestaurante).toHaveBeenCalledWith('Cantina do Davi');
    });

    it('lista os funcionários com a situação de cada um', async () => {
      const { q, text } = await naAbaRestaurante({
        membros: [
          membro(),
          membro({ id: 'm2', nome: 'Bia', email: 'bia@teste.com', status: 'inactive' }),
        ],
      });
      expect(q('status-m1')!.textContent).toContain('Ativo');
      expect(q('status-m2')!.textContent).toContain('Inativo');
      expect(q('perfil-m1')!.textContent).toContain('Operação');
      expect(text()).toContain('ana@teste.com');
      expect(q('sem-funcionarios')).toBeNull();
    });

    it('sem funcionários mostra o aviso', async () => {
      const { q } = await naAbaRestaurante();
      expect(q('sem-funcionarios')).not.toBeNull();
    });

    it('convidar exige nome e e-mail (sem senha); manda o perfil e tudo sem espaços nas pontas', async () => {
      const { q, svc, type, click } = await naAbaRestaurante();
      expect(q('membro-senha')).toBeNull();
      expect(q<HTMLButtonElement>('adicionar-membro')!.disabled).toBe(true);
      await type('membro-nome', '  Ana Garçom ');
      await type('membro-email', 'ana');
      expect(q<HTMLButtonElement>('adicionar-membro')!.disabled).toBe(true);
      await type('membro-email', 'ana@teste.com');
      expect(q<HTMLButtonElement>('adicionar-membro')!.disabled).toBe(false);
      expect(q('membro-perfil-desc')!.textContent).toContain('Não vê relatórios');
      await click('adicionar-membro');
      expect(svc.adicionarMembro).toHaveBeenCalledWith({
        nome: 'Ana Garçom',
        email: 'ana@teste.com',
        perfil: 'operations',
      });
    });

    it('convidar como Gerente', async () => {
      const { q, svc, type, click, settle } = await naAbaRestaurante();
      await type('membro-nome', 'Bia');
      await type('membro-email', 'bia@teste.com');
      const perfil = q<HTMLSelectElement>('membro-perfil')!;
      perfil.value = 'manager';
      perfil.dispatchEvent(new Event('change'));
      await settle();
      expect(q('membro-perfil-desc')!.textContent).toContain('menos assinatura');
      await click('adicionar-membro');
      expect(svc.adicionarMembro).toHaveBeenCalledWith({
        nome: 'Bia',
        email: 'bia@teste.com',
        perfil: 'manager',
      });
    });

    it('e-mail já usado (409) aparece como erro, sem fechar nada', async () => {
      const { svc, type, click, text } = await naAbaRestaurante();
      svc.adicionarMembro.mockRejectedValue({
        response: { status: 409, data: { message: 'Este e-mail já está cadastrado.' } },
      });
      await type('membro-nome', 'Ana');
      await type('membro-email', 'ana@teste.com');
      await click('adicionar-membro');
      expect(text()).toContain('Este e-mail já está cadastrado.');
    });

    const ativos = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        membro({ id: `m${i}`, nome: `F${i}`, email: `f${i}@t.com` }),
      );

    it(`plano Básico: ${SUBSCRIPTION_MEMBER_LIMIT.basic} funcionários ativos; no limite some o formulário e o aviso cita o plano e o Pro`, async () => {
      const { q, text } = await naAbaRestaurante({
        membros: ativos(SUBSCRIPTION_MEMBER_LIMIT.basic),
      });
      expect(q('limite-funcionarios')).not.toBeNull();
      expect(q('adicionar-membro')).toBeNull();
      expect(text()).toContain('5 de 5 vagas de funcionário usadas');
      expect(text()).toContain('plano Básico');
      expect(text()).toContain('mude para o plano Pro (até 20)');
    });

    it('plano Básico com uma vaga: o formulário ainda aparece e o contador mostra 4 de 5', async () => {
      const { q, text } = await naAbaRestaurante({ membros: ativos(4) });
      expect(q('limite-funcionarios')).toBeNull();
      expect(q('adicionar-membro')).not.toBeNull();
      expect(text()).toContain('4 de 5 vagas de funcionário usadas');
    });

    it('plano Pro com 5 ativos ainda tem vagas (5 de 20)', async () => {
      const { q, text } = await naAbaRestaurante({ membros: ativos(5), tier: 'pro' });
      expect(q('limite-funcionarios')).toBeNull();
      expect(q('adicionar-membro')).not.toBeNull();
      expect(text()).toContain('5 de 20 vagas de funcionário usadas · plano Pro');
    });

    it(`plano Pro: com ${SUBSCRIPTION_MEMBER_LIMIT.pro} ativos o formulário some e não oferece o Pro de novo`, async () => {
      const { q, text } = await naAbaRestaurante({
        membros: ativos(SUBSCRIPTION_MEMBER_LIMIT.pro),
        tier: 'pro',
      });
      expect(q('adicionar-membro')).toBeNull();
      expect(text()).toContain('20 vagas de funcionário do plano Pro');
      expect(text()).not.toContain('mude para o plano Pro');
    });

    it('sem tipo de plano conhecido vale o Básico', async () => {
      const { text } = await naAbaRestaurante({ membros: ativos(1), tier: null });
      expect(text()).toContain('1 de 5 vagas de funcionário usadas · plano Básico');
    });

    it('inativados não ocupam vaga: 5 inativos + 2 ativos continua com vagas', async () => {
      const inativos = Array.from({ length: 5 }, (_, i) =>
        membro({ id: `i${i}`, email: `i${i}@t.com`, status: 'inactive' }),
      );
      const { q, text } = await naAbaRestaurante({ membros: [...inativos, ...ativos(2)] });
      expect(text()).toContain('2 de 5 vagas de funcionário usadas');
      expect(q('adicionar-membro')).not.toBeNull();
    });

    it('convite pendente ocupa vaga e aparece como "Convite enviado", com a validade', async () => {
      const convidado = membro({
        id: 'c1',
        email: 'c@t.com',
        status: 'invited',
        conviteVenceEm: '2026-11-24T12:00:00.000Z',
      });
      const { q, text } = await naAbaRestaurante({ membros: [...ativos(4), convidado] });
      expect(text()).toContain('5 de 5 vagas de funcionário usadas');
      expect(q('status-c1')!.textContent).toContain('Convite enviado');
      expect(q('convite-vence-c1')!.textContent).toContain('24/11/2026');
      expect(q('adicionar-membro')).toBeNull();
    });

    it('reenviar convite só aparece para convidado e chama o serviço', async () => {
      const { q, svc, click } = await naAbaRestaurante({
        membros: [membro(), membro({ id: 'c1', email: 'c@t.com', status: 'invited' })],
      });
      expect(q('reenviar-convite-m1')).toBeNull();
      await click('reenviar-convite-c1');
      expect(svc.reenviarConvite).toHaveBeenCalledWith('c1');
    });

    it('editar: abre com nome, e-mail e perfil; manda só o que mudou', async () => {
      const { q, svc, type, click, settle } = await naAbaRestaurante({ membros: [membro()] });
      await click('editar-membro-m1');
      expect(q<HTMLInputElement>('edicao-nome-m1')!.value).toBe('Ana Garçom');
      await type('edicao-email-m1', 'ana.nova@teste.com');
      const perfil = q<HTMLSelectElement>('edicao-perfil-m1')!;
      perfil.value = 'manager';
      perfil.dispatchEvent(new Event('change'));
      await settle();
      await click('salvar-membro-m1');
      expect(svc.atualizarMembro).toHaveBeenCalledWith('m1', {
        email: 'ana.nova@teste.com',
        perfil: 'manager',
      });
      expect(q('edicao-membro-m1')).toBeNull();
    });

    it('editar sem mudar nada só fecha; e-mail inválido não deixa salvar', async () => {
      const { q, svc, type, click } = await naAbaRestaurante({ membros: [membro()] });
      await click('editar-membro-m1');
      await type('edicao-email-m1', 'ana');
      expect(q<HTMLButtonElement>('salvar-membro-m1')!.disabled).toBe(true);
      await type('edicao-email-m1', 'ana@teste.com');
      await click('salvar-membro-m1');
      expect(svc.atualizarMembro).not.toHaveBeenCalled();
      expect(q('edicao-membro-m1')).toBeNull();
    });

    it('excluir pede confirmação; cancelar não exclui; confirmar chama o serviço', async () => {
      const { q, svc, click, root, settle } = await naAbaRestaurante({ membros: [membro()] });
      await click('excluir-membro-m1');
      expect(q('confirmar-exclusao-membro-m1')!.textContent).toContain('histórico');
      const cancelar = Array.from(
        q('confirmar-exclusao-membro-m1')!.querySelectorAll('button'),
      ).find((b) => b.textContent?.trim() === 'Cancelar')!;
      cancelar.click();
      await settle();
      expect(q('confirmar-exclusao-membro-m1')).toBeNull();
      expect(svc.excluirMembro).not.toHaveBeenCalled();
      await click('excluir-membro-m1');
      await click('confirmar-excluir-m1');
      expect(svc.excluirMembro).toHaveBeenCalledWith('m1');
      expect(root.querySelector('[data-testid="confirmar-exclusao-membro-m1"]')).toBeNull();
    });

    it('com o plano cheio, reativar fica desabilitado; inativar continua liberado', async () => {
      const cheios = [...ativos(5), membro({ id: 'x', email: 'x@t.com', status: 'inactive' })];
      const { q } = await naAbaRestaurante({ membros: cheios });
      expect(q<HTMLButtonElement>('alternar-x')!.disabled).toBe(true);
      expect(q<HTMLButtonElement>('alternar-m0')!.disabled).toBe(false);
    });

    it('cada funcionário aparece com a foto dele ou, sem foto, com as iniciais', async () => {
      const { q } = await naAbaRestaurante({
        membros: [
          membro({ id: 'm1', foto: 'data:image/png;base64,AAA' }),
          membro({ id: 'm2', nome: 'Bia de Souza', email: 'bia@teste.com' }),
        ],
      });
      expect(q<HTMLImageElement>('foto-membro-m1')!.src).toBe('data:image/png;base64,AAA');
      expect(q('iniciais-membro-m1')).toBeNull();
      expect(q('foto-membro-m2')).toBeNull();
      expect(q('iniciais-membro-m2')!.textContent!.trim()).toBe('BS');
    });

    it('inativar e reativar chamam o serviço com o status contrário', async () => {
      const { svc, click } = await naAbaRestaurante({
        membros: [membro(), membro({ id: 'm2', status: 'inactive' })],
      });
      await click('alternar-m1');
      await click('alternar-m2');
      expect(svc.atualizarMembro).toHaveBeenNthCalledWith(1, 'm1', { status: 'inactive' });
      expect(svc.atualizarMembro).toHaveBeenNthCalledWith(2, 'm2', { status: 'active' });
    });

    it('o dono não define mais a senha do funcionário (E.1)', async () => {
      const { root } = await naAbaRestaurante({ membros: [membro()] });
      const botoes = Array.from(root.querySelectorAll('button')).map((b) => b.textContent?.trim());
      expect(botoes).not.toContain('Nova senha');
    });
  });

  describe('foto de perfil', () => {
    const arquivo = (tipo = 'image/png', tamanho = 10) =>
      new File([new Uint8Array(tamanho)], 'foto.png', { type: tipo });
    async function escolher(r: ReturnType<typeof render>, file: File) {
      const input = r.q<HTMLInputElement>('arquivo-foto')!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      // A leitura da imagem (FileReader) é assíncrona e mais lenta no CI: em vez de um tempo fixo, espera até a
      // foto ser enviada ou o motivo da recusa aparecer (no máximo 2 s), e então mais um ciclo para a tela atualizar.
      const terminou = () =>
        r.auth.updateAvatar.mock.calls.length > 0 ||
        /Formato não aceito|Imagem muito grande|Não foi possível ler/.test(r.text());
      const inicio = Date.now();
      while (!terminou() && Date.now() - inicio < 2000) {
        await new Promise((res) => setTimeout(res, 10));
        await r.settle();
      }
      await new Promise((res) => setTimeout(res, 10));
      await r.settle();
    }

    it('sem foto mostra as iniciais e "Adicionar foto"; sem o botão Remover', async () => {
      const r = render();
      await r.settle();
      expect(r.q('foto-iniciais')!.textContent!.trim()).toBe('DL');
      expect(r.q('trocar-foto')!.textContent!.trim()).toBe('Adicionar foto');
      expect(r.q('remover-foto')).toBeNull();
    });

    it('com foto mostra a imagem, "Trocar foto" e "Remover"', async () => {
      const r = render({ foto: 'data:image/png;base64,AAA' });
      await r.settle();
      expect(r.q<HTMLImageElement>('foto-atual')!.src).toBe('data:image/png;base64,AAA');
      expect(r.q('trocar-foto')!.textContent!.trim()).toBe('Trocar foto');
      expect(r.q('remover-foto')).not.toBeNull();
    });

    it('funcionário também troca a própria foto (a tela dos dados é a mesma)', async () => {
      const r = render({ dados: funcionario });
      await r.settle();
      expect(r.q('bloco-foto')).not.toBeNull();
    });

    it('escolher uma imagem envia a foto ao AuthService e já mostra a nova', async () => {
      const r = render();
      await r.settle();
      await escolher(r, arquivo());
      expect(r.auth.updateAvatar).toHaveBeenCalledTimes(1);
      expect(r.auth.updateAvatar.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/);
      expect(r.toast.success).toHaveBeenCalledWith('Foto de perfil atualizada.');
      expect(r.q('foto-atual')).not.toBeNull();
    });

    it('formato inválido: mostra o motivo e não envia nada', async () => {
      const r = render();
      await r.settle();
      await escolher(r, arquivo('application/pdf'));
      expect(r.auth.updateAvatar).not.toHaveBeenCalled();
      expect(r.text()).toContain('Formato não aceito. Use JPG, PNG ou WebP.');
    });

    it('imagem grande demais: mostra o motivo e não envia nada', async () => {
      const r = render();
      await r.settle();
      await escolher(r, arquivo('image/png', 2 * 1024 * 1024));
      expect(r.auth.updateAvatar).not.toHaveBeenCalled();
      expect(r.text()).toContain('Imagem muito grande');
    });

    it('erro da API ao trocar: mostra a mensagem dela', async () => {
      const r = render();
      await r.settle();
      r.auth.updateAvatar.mockRejectedValue({
        response: { status: 413, data: { message: 'Foto pesada demais.' } },
      });
      await escolher(r, arquivo());
      expect(r.text()).toContain('Foto pesada demais.');
    });

    it('remover chama o AuthService e volta para as iniciais', async () => {
      const r = render({ foto: 'data:image/png;base64,AAA' });
      await r.settle();
      await r.click('remover-foto');
      expect(r.auth.removeAvatar).toHaveBeenCalledTimes(1);
      expect(r.toast.success).toHaveBeenCalledWith('Foto removida.');
      expect(r.q('foto-iniciais')).not.toBeNull();
    });
  });

  describe('pedido de exclusão (dono)', () => {
    async function naAbaRestaurante(over: Parameters<typeof render>[0] = {}) {
      const r = render(over);
      await r.settle();
      await r.click('aba-restaurante');
      return r;
    }

    it('começa fechado: só o botão "Solicitar exclusão"', async () => {
      const { q } = await naAbaRestaurante();
      expect(q('abrir-exclusao')).not.toBeNull();
      expect(q('exclusao-senha')).toBeNull();
      expect(q('exclusao-pedida')).toBeNull();
    });

    it('exige a senha para confirmar e manda a senha e o motivo', async () => {
      const { q, svc, click, type } = await naAbaRestaurante();
      await click('abrir-exclusao');
      expect(q<HTMLButtonElement>('confirmar-exclusao')!.disabled).toBe(true);
      await type('exclusao-motivo', 'Fechei o restaurante');
      await type('exclusao-senha', 'Senha123');
      await click('confirmar-exclusao');
      expect(svc.pedirExclusao).toHaveBeenCalledWith('Senha123', 'Fechei o restaurante');
    });

    it('senha errada aparece como erro e o pedido não é dado como feito', async () => {
      const { q, svc, click, type, text } = await naAbaRestaurante();
      svc.pedirExclusao.mockRejectedValue({
        response: { status: 403, data: { message: 'Senha incorreta.' } },
      });
      await click('abrir-exclusao');
      await type('exclusao-senha', 'Errada123');
      await click('confirmar-exclusao');
      expect(text()).toContain('Senha incorreta.');
      expect(q('exclusao-pedida')).toBeNull();
    });

    it('com pedido feito mostra a data, avisa que nada foi apagado e deixa cancelar', async () => {
      const { q, svc, click, text } = await naAbaRestaurante({
        exclusaoEm: '2026-11-03T15:00:00.000Z',
      });
      expect(q('exclusao-pedida')).not.toBeNull();
      expect(text()).toContain('Nada foi apagado ainda');
      expect(q('abrir-exclusao')).toBeNull();
      await click('cancelar-exclusao');
      expect(svc.cancelarExclusao).toHaveBeenCalled();
    });
  });
});
