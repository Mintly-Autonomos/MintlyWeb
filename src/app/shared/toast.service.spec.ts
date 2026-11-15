import { TestBed } from '@angular/core/testing';
import { ToastContainerComponent } from './toast-container.component';
import { ToastService } from './toast.service';

describe('Toast com ação (Desfazer)', () => {
  it('mostra o botão; clicar fecha o aviso e roda a ação', () => {
    const fixture = TestBed.createComponent(ToastContainerComponent);
    const svc = TestBed.inject(ToastService);
    const run = vi.fn();
    svc.successWithAction('Bolo foi inativado.', { label: 'Desfazer', run });
    fixture.detectChanges();

    const botao = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Desfazer');
    expect(botao).toBeDefined();
    botao!.click();
    fixture.detectChanges();

    expect(run).toHaveBeenCalledTimes(1);
    expect(svc.toasts()).toEqual([]);
  });

  it('aviso comum continua sem botão de ação', () => {
    const fixture = TestBed.createComponent(ToastContainerComponent);
    TestBed.inject(ToastService).success('Salvo.');
    fixture.detectChanges();
    const textos = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).map((b) => b.textContent?.trim());
    expect(textos).not.toContain('Desfazer');
  });
});
