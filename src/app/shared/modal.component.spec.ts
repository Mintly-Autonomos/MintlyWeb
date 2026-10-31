import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

@Component({
  standalone: true,
  imports: [ModalComponent],
  template: `
    <app-modal title="Teste" [size]="size">
      <p class="conteudo">corpo</p>
      <ng-container ngProjectAs="[slot=footer]">
        <button type="button" class="rodape">ok</button>
      </ng-container>
    </app-modal>
  `,
})
class HostComponent {
  size: 'md' | 'lg' | 'xl' = 'md';
}

describe('ModalComponent (tamanhos)', () => {
  function render(size: 'md' | 'lg' | 'xl') {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.size = size;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    const body = dialog.querySelector('.conteudo')!.parentElement as HTMLElement;
    const footer = root.querySelector('.rodape')!.parentElement as HTMLElement;
    return { dialog, body, footer };
  }

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('xl: ocupa a altura da tela e o conteúdo rola por conta própria; rodapé nunca sai da tela', () => {
    const { dialog, body, footer } = render('xl');
    expect(dialog.className).toContain('h-[min(860px,94dvh)]');
    expect(dialog.className).toContain('flex-col');
    expect(dialog.className).toContain('max-w-[min(1320px,96vw)]');
    // o corpo não rola sozinho (quem rola é a tabela dentro dele) e ocupa o espaço que sobra
    expect(body.className).toContain('flex-1');
    expect(body.className).toContain('min-h-0');
    expect(body.className).toContain('overflow-hidden');
    expect(body.className).not.toContain('overflow-y-auto');
    expect(footer.className).toContain('shrink-0');
  });

  it('md e lg continuam como eram: corpo com rolagem própria e largura fixa', () => {
    const md = render('md');
    expect(md.dialog.className).toContain('max-w-xl');
    expect(md.body.className).toContain('overflow-y-auto');
    expect(md.dialog.className).not.toContain('h-[min(860px,94dvh)]');
    TestBed.resetTestingModule();
    const lg = render('lg');
    expect(lg.dialog.className).toContain('max-w-3xl');
    expect(lg.body.className).toContain('overflow-y-auto');
  });
});
