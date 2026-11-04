import { TestBed } from '@angular/core/testing';
import { InsightCardComponent } from './insight-card.component';

describe('InsightCardComponent: selo da IA', () => {
  function montar(ia: boolean) {
    const fixture = TestBed.createComponent(InsightCardComponent);
    fixture.componentRef.setInput('title', 'Caixa curto no fim do mês');
    fixture.componentRef.setInput('description', 'Antecipe um recebimento.');
    fixture.componentRef.setInput('ia', ia);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('com texto da IA mostra o selo "IA" com a explicação no tooltip', () => {
    const el = montar(true);
    const selo = el.querySelector<HTMLElement>('[data-testid="insight-ia"]');
    expect(selo).not.toBeNull();
    expect(selo!.textContent).toContain('IA');
    expect(selo!.title).toContain('IA');
  });

  it('sem texto da IA (padrão) não mostra o selo', () => {
    expect(montar(false).querySelector('[data-testid="insight-ia"]')).toBeNull();
    const padrao = TestBed.createComponent(InsightCardComponent);
    padrao.detectChanges();
    expect(
      (padrao.nativeElement as HTMLElement).querySelector('[data-testid="insight-ia"]'),
    ).toBeNull();
  });

  it('o texto do card aparece igual com ou sem selo', () => {
    expect(montar(true).textContent).toContain('Caixa curto no fim do mês');
    expect(montar(false).textContent).toContain('Antecipe um recebimento.');
  });
});
