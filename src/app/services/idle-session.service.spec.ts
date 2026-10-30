import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import {
  IDLE_TIMEOUT_MINUTES,
  IDLE_TIMEOUT_MS,
  IdleSessionService,
  LAST_ACTIVITY_KEY,
} from './idle-session.service';

const MIN = 60 * 1000;

describe('IdleSessionService', () => {
  let svc: IdleSessionService;
  let logout: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;
  let order: string[];
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
    localStorage.clear();
    order = [];
    refresh = vi.fn().mockImplementation(async () => {
      order.push('refresh');
      return true;
    });
    logout = vi.fn().mockImplementation(async () => {
      order.push('logout');
    });
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { logout, refresh } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    svc = TestBed.inject(IdleSessionService);
  });

  afterEach(() => {
    svc.stop();
    vi.useRealTimers();
  });

  const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  const act = (name = 'keydown') => window.dispatchEvent(new Event(name));

  it('o limite é de 30 minutos', () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * MIN);
    expect(IDLE_TIMEOUT_MINUTES).toBe(30);
  });

  it('sem usar por 30 minutos: encerra a sessão e leva à tela com o motivo "inatividade"', async () => {
    svc.start();
    await advance(29 * MIN);
    expect(logout).not.toHaveBeenCalled();

    await advance(2 * MIN);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith(['/auth/sessao-expirada'], {
      queryParams: { motivo: 'inatividade' },
    });
  });

  it('renova o token antes de sair, para o servidor aceitar o logout e revogar o token de renovação', async () => {
    svc.start();
    await advance(31 * MIN);
    expect(order).toEqual(['refresh', 'logout']);
  });

  it('usar o app (tecla, mouse, toque, rolagem) recomeça a contagem', async () => {
    svc.start();
    for (const name of ['keydown', 'pointerdown', 'touchstart', 'wheel']) {
      await advance(25 * MIN);
      act(name);
    }
    expect(logout).not.toHaveBeenCalled();

    await advance(31 * MIN);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('movimento do mouse também conta como uso', async () => {
    svc.start();
    await advance(29 * MIN);
    act('pointermove');
    await advance(29 * MIN);
    expect(logout).not.toHaveBeenCalled();
  });

  it('uso em OUTRA aba (guardado no localStorage) segura esta aba', async () => {
    svc.start();
    await advance(29 * MIN);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    await advance(29 * MIN);
    expect(logout).not.toHaveBeenCalled();
    await advance(3 * MIN);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('computador que dormiu: ao voltar para a aba a checagem é imediata, sem esperar o ciclo', async () => {
    svc.start();
    vi.setSystemTime(Date.now() + 5 * 60 * MIN); // 5 horas depois, sem nenhum temporizador ter rodado

    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/auth/sessao-expirada'], {
      queryParams: { motivo: 'inatividade' },
    });
  });

  it('ao focar a janela depois de muito tempo também encerra', async () => {
    svc.start();
    vi.setSystemTime(Date.now() + 2 * 60 * MIN);
    window.dispatchEvent(new Event('focus'));
    await advance(0);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('voltar para a aba dentro do limite não encerra nada', async () => {
    svc.start();
    vi.setSystemTime(Date.now() + 10 * MIN);
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);
    expect(logout).not.toHaveBeenCalled();
  });

  it('stop() para de vigiar: nada acontece depois', async () => {
    svc.start();
    svc.stop();
    await advance(2 * 60 * MIN);
    expect(logout).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBeNull();
  });

  it('start() repetido não duplica a vigilância (um único encerramento)', async () => {
    svc.start();
    svc.start();
    svc.start();
    await advance(40 * MIN);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('encerra uma vez só, mesmo que o tempo continue passando', async () => {
    svc.start();
    await advance(31 * MIN);
    await advance(2 * 60 * MIN);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('o uso é guardado no máximo a cada 5 segundos (movimento do mouse não martela o storage)', async () => {
    svc.start();
    const first = localStorage.getItem(LAST_ACTIVITY_KEY);
    await advance(2000);
    act('pointermove');
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBe(first);
    await advance(4000);
    act('pointermove');
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).not.toBe(first);
  });

  it('sem localStorage (bloqueado) ainda vigia pelo uso desta aba', async () => {
    const original = Storage.prototype.setItem;
    const originalGet = Storage.prototype.getItem;
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado');
    };
    Storage.prototype.getItem = () => {
      throw new Error('bloqueado');
    };
    try {
      svc.start();
      await advance(31 * MIN);
      expect(logout).toHaveBeenCalledTimes(1);
    } finally {
      Storage.prototype.setItem = original;
      Storage.prototype.getItem = originalGet;
    }
  });

  it('depois de encerrar dá para começar a vigiar de novo (novo login)', async () => {
    svc.start();
    await advance(31 * MIN);
    expect(logout).toHaveBeenCalledTimes(1);

    svc.start();
    await advance(31 * MIN);
    expect(logout).toHaveBeenCalledTimes(2);
  });
});
