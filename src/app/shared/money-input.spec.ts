import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { parseNumberBR } from '../services/movimentacoes.service';
import { formatMoneyInput, moneyToInput, padMoneyInput } from './money-input';
import { MoneyInputDirective } from './money-input.directive';

describe('formatMoneyInput', () => {
  it.each([
    ['', ''],
    ['1', '1'],
    ['14500', '14.500'],
    ['1234567', '1.234.567'],
    ['14500,5', '14.500,5'],
    ['14500,50', '14.500,50'],
    ['14500,509', '14.500,50'],
    [',5', '0,5'],
    ['0014500', '14.500'],
    ['R$ 1.234,56', '1.234,56'],
    ['1234.56', '1.234,56'],
    ['1.234', '1.234'],
    ['abc12x3', '123'],
    ['12,3,4', '12,34'],
  ])('"%s" -> "%s"', (raw, expected) => {
    expect(formatMoneyInput(raw)).toBe(expected);
  });

  it('o texto formatado volta para o mesmo número', () => {
    for (const n of [0.5, 12.5, 1234.5, 14500, 14500.5, 1234567.89]) {
      expect(parseNumberBR(moneyToInput(n))).toBe(n);
    }
  });
});

describe('padMoneyInput (sempre fecha com as duas casas)', () => {
  it.each([
    ['145', '145,00'],
    ['145,5', '145,50'],
    ['145,50', '145,50'],
    ['145,', '145,00'],
    ['14500', '14.500,00'],
    ['14500,5', '14.500,50'],
    [',5', '0,50'],
    ['0', '0,00'],
    ['R$ 1.234,5', '1.234,50'],
    ['1234.5', '1.234,50'],
    ['', ''],
    ['abc', ''],
  ])('"%s" -> "%s"', (raw, expected) => {
    expect(padMoneyInput(raw)).toBe(expected);
  });

  it('o texto completado volta para o mesmo número', () => {
    for (const raw of ['145', '14500,5', '0,5']) {
      expect(parseNumberBR(padMoneyInput(raw))).toBe(parseNumberBR(raw));
    }
  });
});

describe('moneyToInput', () => {
  it('número -> texto do campo, sempre com 2 casas', () => {
    expect(moneyToInput(155)).toBe('155,00');
    expect(moneyToInput(14500.5)).toBe('14.500,50');
    expect(moneyToInput(null)).toBe('');
    expect(moneyToInput(NaN)).toBe('');
  });
});

@Component({
  standalone: true,
  imports: [FormsModule, MoneyInputDirective],
  template: `<input appMoneyInput [ngModel]="value()" (ngModelChange)="value.set($event)" />`,
})
class HostComponent {
  value = signal('');
}

describe('MoneyInputDirective', () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable(); // o ngModel grava o valor inicial de forma assíncrona
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const type = async (text: string, caret = text.length) => {
      input.value = text;
      input.setSelectionRange(caret, caret);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, input, type };
  }

  it('digitar 14500 mostra 14.500 e o modelo recebe o texto formatado', async () => {
    const { fixture, input, type } = await setup();
    await type('14500');
    expect(input.value).toBe('14.500');
    expect(fixture.componentInstance.value()).toBe('14.500');
    expect(parseNumberBR(fixture.componentInstance.value())).toBe(14500);
  });

  it('centavos com vírgula, no máximo 2 casas', async () => {
    const { input, type } = await setup();
    await type('14.500,5');
    expect(input.value).toBe('14.500,5');
    await type('14.500,567');
    expect(input.value).toBe('14.500,56');
  });

  it('mantém o cursor no lugar ao digitar no meio', async () => {
    const { input, type } = await setup();
    // "1.234" com um 5 digitado depois do "2": "1.2534" -> "12.534", cursor logo depois do 5
    await type('1.2534', 4);
    expect(input.value).toBe('12.534');
    expect(input.selectionStart).toBe(4);
  });

  describe('ao sair do campo (blur)', () => {
    it('145 fecha com ,00 e o modelo recebe o texto completo', async () => {
      const { fixture, input, type } = await setup();
      await type('145');
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(input.value).toBe('145,00');
      expect(fixture.componentInstance.value()).toBe('145,00');
      expect(parseNumberBR(fixture.componentInstance.value())).toBe(145);
    });

    it('14500,5 vira 14.500,50', async () => {
      const { fixture, input, type } = await setup();
      await type('14500,5');
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(input.value).toBe('14.500,50');
      expect(fixture.componentInstance.value()).toBe('14.500,50');
    });

    it('campo vazio continua vazio (não inventa 0,00)', async () => {
      const { fixture, input } = await setup();
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(input.value).toBe('');
    });

    it('já completo não muda, e voltar ao campo e sair de novo é inofensivo', async () => {
      const { fixture, input, type } = await setup();
      await type('1.234,56');
      input.dispatchEvent(new Event('blur'));
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(input.value).toBe('1.234,56');
    });
  });

  it('cursor no início continua no início', async () => {
    const { input, type } = await setup();
    await type('1234', 0);
    expect(input.value).toBe('1.234');
    expect(input.selectionStart).toBe(0);
  });
});
