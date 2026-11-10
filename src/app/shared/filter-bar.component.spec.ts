import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FilterBarComponent } from './filter-bar.component';

@Component({
  standalone: true,
  imports: [FilterBarComponent],
  template: `
    <app-filter-bar placeholder="Buscar" [activeCount]="0">
      <span data-testid="opcao-filtro">Tipo: todos</span>
    </app-filter-bar>
  `,
})
class HostComponent {}

describe('FilterBarComponent: opções de filtro à mostra só no celular', () => {
  const original = globalThis.matchMedia;
  afterEach(() => {
    globalThis.matchMedia = original;
  });

  function render(mobile: boolean) {
    globalThis.matchMedia = ((query: string) => ({
      matches: mobile && query.includes('max-width: 639px'),
    })) as typeof matchMedia;
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }
  const opcao = (f: ReturnType<typeof render>) =>
    f.nativeElement.querySelector('[data-testid="opcao-filtro"]');
  const botao = (f: ReturnType<typeof render>) =>
    f.nativeElement.querySelector('[data-testid="alternar-filtros"]') as HTMLButtonElement;

  it('no celular as opções já vêm abertas, sem precisar tocar em Filtros', () => {
    const f = render(true);
    expect(opcao(f)).not.toBeNull();
    expect(botao(f).getAttribute('aria-expanded')).toBe('true');
  });

  it('no computador ficam recolhidas atrás do botão Filtros', () => {
    const f = render(false);
    expect(opcao(f)).toBeNull();
    expect(botao(f).getAttribute('aria-expanded')).toBe('false');
  });

  it('nos dois casos o botão abre e fecha as opções', () => {
    for (const mobile of [true, false]) {
      TestBed.resetTestingModule();
      const f = render(mobile);
      botao(f).click();
      f.detectChanges();
      expect(opcao(f) !== null).toBe(!mobile);
      botao(f).click();
      f.detectChanges();
      expect(opcao(f) !== null).toBe(mobile);
    }
  });

  it('a busca e o botão Filtros dividem a mesma linha no celular (a busca não ocupa a linha toda)', () => {
    const f = render(true);
    const linha = f.nativeElement.querySelector('input')!.closest('div')!.parentElement!;
    expect(linha.className).toContain('sm:flex-wrap');
    expect(linha.className).not.toMatch(/(^|\s)flex-wrap/);
    expect(f.nativeElement.querySelector('input')!.parentElement!.className).toContain('min-w-0');
  });
});
