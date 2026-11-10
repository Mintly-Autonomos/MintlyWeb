import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartCardComponent } from './chart-card.component';

@Component({
  standalone: true,
  imports: [ChartCardComponent],
  template: `
    <app-chart-card
      title="Receita vs. Custos"
      [loading]="loading"
      [empty]="empty"
      emptyTitle="Ainda não há lançamentos"
      emptyDescription="Registre uma venda e o gráfico aparece."
    >
      <button slot="empty-action" type="button" data-testid="acao-vazio">Lançar venda</button>
      <div data-testid="grafico">o gráfico</div>
    </app-chart-card>
  `,
})
class HostComponent {
  loading = false;
  empty = false;
}

describe('ChartCardComponent: estado vazio', () => {
  function render(over: Partial<HostComponent> = {}) {
    const fixture = TestBed.createComponent(HostComponent);
    Object.assign(fixture.componentInstance, over);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const q = (root: HTMLElement, id: string) => root.querySelector(`[data-testid="${id}"]`);

  it('com dados mostra o gráfico, sem o estado vazio', () => {
    const root = render();
    expect(q(root, 'grafico')).not.toBeNull();
    expect(q(root, 'grafico-vazio')).toBeNull();
  });

  it('sem dados explica o que o gráfico mostra e oferece o atalho que gera os dados', () => {
    const root = render({ empty: true });
    expect(q(root, 'grafico')).toBeNull();
    const vazio = q(root, 'grafico-vazio')!;
    expect(vazio.textContent).toContain('Ainda não há lançamentos');
    expect(vazio.textContent).toContain('Registre uma venda e o gráfico aparece.');
    expect(vazio.querySelector('[data-testid="acao-vazio"]')?.textContent).toContain(
      'Lançar venda',
    );
  });

  it('enquanto carrega mostra o esqueleto, não o estado vazio (ainda não se sabe se há dados)', () => {
    const root = render({ empty: true, loading: true });
    expect(q(root, 'grafico-vazio')).toBeNull();
    expect(q(root, 'grafico')).toBeNull();
  });
});
