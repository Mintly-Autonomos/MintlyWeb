import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

@Component({
  standalone: true,
  imports: [ModalComponent],
  template: `
    <app-modal [open]="open()" title="Nova saída" [dirty]="dirty()" (closed)="fechou = fechou + 1">
      <input data-testid="primeiro" />
      <input data-testid="segundo" />
    </app-modal>
  `,
})
class HostComponent {
  open = signal(true);
  dirty = signal(false);
  fechou = 0;
}

describe('Modal: não perde o que foi preenchido sem perguntar', () => {
  function render(dirty: boolean) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.dirty.set(dirty);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const esc = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
    };
    return { fixture, root, esc, host: fixture.componentInstance };
  }

  it('vazio: Esc fecha na hora', () => {
    const { esc, host } = render(false);
    esc();
    expect(host.fechou).toBe(1);
  });

  it('preenchido: Esc pergunta antes; "Continuar editando" mantém aberto; "Descartar" fecha', () => {
    const { esc, host, root, fixture } = render(true);
    esc();
    expect(host.fechou).toBe(0);
    expect(root.querySelector('[data-testid="confirmar-descartar"]')?.textContent).toContain(
      'Descartar o que você preencheu?',
    );
    (root.querySelector('[data-testid="continuar-editando"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="confirmar-descartar"]')).toBeNull();
    expect(host.fechou).toBe(0);

    esc();
    (root.querySelector('[data-testid="descartar"]') as HTMLButtonElement).click();
    expect(host.fechou).toBe(1);
  });

  it('preenchido: o "X" e o clique fora também perguntam', () => {
    const { host, root, fixture } = render(true);
    (root.querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.fechou).toBe(0);
    expect(root.querySelector('[data-testid="confirmar-descartar"]')).not.toBeNull();
  });

  it('ao abrir, o foco vai para o primeiro campo', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    expect((document.activeElement as HTMLElement | null)?.dataset['testid']).toBe('primeiro');
  });
});
