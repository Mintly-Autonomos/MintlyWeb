import { TestBed } from '@angular/core/testing';
import { ScatterChartComponent, ScatterPoint } from './scatter-chart.component';

// Reteste 24/11: com 11 pratos, todos com nome (o Uramaki ficava sem rótulo), sem cortar na borda direita.
describe('ScatterChartComponent: rótulos dos pratos', () => {
  it('todo prato tem nome, mesmo com pontos colados; o da borda direita vira para a esquerda', () => {
    const nomes = [
      'Combo 20 peças',
      'Hot roll (10 un)',
      'Uramaki filadélfia',
      'Yakisoba de frango',
      'Sashimi de salmão',
      'Temaki salmão',
      'Missoshiro',
      'Refrigerante',
      'Cerveja',
      'Gyoza',
      'Harumaki',
    ];
    const pontos: ScatterPoint[] = nomes.map((nome, i) => ({
      id: `p${i}`,
      nome,
      categoria: null,
      // Vários pratos quase no mesmo lugar (como Uramaki × Hot roll e Yakisoba × Sashimi no reteste).
      x: i < 4 ? 150 + i : 60 + i * 12,
      y: i < 4 ? 30 + i * 0.3 : 20 + i,
      margemPct: 50,
      grupo: 'estrela',
      grupoLabel: 'Melhores',
      cor: 'var(--success)',
      forma: 'circle',
      rotulo: true,
    }));
    pontos[0] = { ...pontos[0], x: 300 };
    const f = TestBed.createComponent(ScatterChartComponent);
    f.componentInstance.points = pontos;
    f.componentInstance.xMax = 310;
    f.componentInstance.yMin = 0;
    f.componentInstance.yMax = 50;
    f.componentInstance.mediaX = 100;
    f.componentInstance.mediaY = 25;
    f.detectChanges();
    const rotulos = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll('[data-testid="rotulo-prato"]'),
    );
    expect(rotulos.length).toBe(11);
    expect(rotulos.map((r) => r.textContent?.trim())).toContain('Uramaki filadélfia');
    const combo = rotulos.find((r) => r.textContent?.includes('Combo 20'))!;
    expect(combo.getAttribute('text-anchor')).toBe('end');
  });
});
