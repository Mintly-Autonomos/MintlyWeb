import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { parseNumberBR } from '../services/movimentacoes.service';
import { formatMoneyInput, moneyToInput, pasteMoneyInput } from './money-input';
import { MoneyInputDirective } from './money-input.directive';

describe('formatMoneyInput (centavos primeiro, como caixa eletrônico)', () => {
  it('digitar 4, 5, 1 em sequência: 0,04 -> 0,45 -> 4,51', () => {
    expect(formatMoneyInput('4')).toBe('0,04');
    expect(formatMoneyInput('0,045')).toBe('0,45');
    expect(formatMoneyInput('0,451')).toBe('4,51');
  });

  it.each([
    ['', ''],
    ['abc', ''],
    ['0', '0,00'],
    ['00', '0,00'],
    ['4', '0,04'],
    ['45', '0,45'],
    ['451', '4,51'],
    ['14500', '145,00'],
    ['1450000', '14.500,00'],
    ['123456789', '1.234.567,89'],
    ['0,04', '0,04'],
    ['R$ 1.234,56', '1.234,56'],
    ['12a3', '1,23'],
    ['000123', '1,23'],
    ['1234567890123456', '1.234.567.890,12'],
  ])('"%s" -> "%s"', (raw, expected) => {
    expect(formatMoneyInput(raw)).toBe(expected);
  });

  it('o texto formatado volta para o mesmo número', () => {
    for (const n of [0.5, 12.5, 1234.5, 14500, 14500.5, 1234567.89]) {
      expect(parseNumberBR(moneyToInput(n))).toBe(n);
    }
  });
});

describe('pasteMoneyInput (colar vale como número, não como centavos)', () => {
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
    ['1.234', '1.234,00'],
    ['', ''],
    ['abc', ''],
  ])('"%s" -> "%s"', (raw, expected) => {
    expect(pasteMoneyInput(raw)).toBe(expected);
  });

  it('o texto colado volta para o mesmo número', () => {
    for (const raw of ['145', '14500,5', '0,5']) {
      expect(parseNumberBR(pasteMoneyInput(raw))).toBe(parseNumberBR(raw));
    }
  });
});

describe('moneyToInput', () => {
  it('número -> texto do campo, sempre com 2 casas', () => {
    expect(moneyToInput(155)).toBe('155,00');
    expect(moneyToInput(14500.5)).toBe('14.500,50');
    expect(moneyToInput(0.07)).toBe('0,07');
    expect(moneyToInput(0)).toBe('0,00');
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
    const fire = async (inputType?: string) => {
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    /** Como o navegador: o dígito entra na posição do cursor e o evento dispara. */
    const press = async (key: string) => {
      const pos = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, pos) + key + input.value.slice(pos);
      input.setSelectionRange(pos + 1, pos + 1);
      await fire('insertText');
    };
    const backspace = async () => {
      const pos = input.selectionStart ?? input.value.length;
      if (pos === 0) return;
      input.value = input.value.slice(0, pos - 1) + input.value.slice(pos);
      input.setSelectionRange(pos - 1, pos - 1);
      await fire('deleteContentBackward');
    };
    const paste = (text: string) => {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
      input.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };
    return { fixture, input, press, backspace, paste };
  }

  it('digitar 4, 5, 1 mostra 0,04, depois 0,45, depois 4,51', async () => {
    const { fixture, input, press } = await setup();
    await press('4');
    expect(input.value).toBe('0,04');
    await press('5');
    expect(input.value).toBe('0,45');
    await press('1');
    expect(input.value).toBe('4,51');
    expect(fixture.componentInstance.value()).toBe('4,51');
    expect(parseNumberBR(fixture.componentInstance.value())).toBe(4.51);
  });

  it('milhar com ponto conforme os dígitos entram', async () => {
    const { input, press } = await setup();
    for (const d of '1450000') await press(d);
    expect(input.value).toBe('14.500,00');
  });

  it('o cursor fica no fim ao digitar no fim', async () => {
    const { input, press } = await setup();
    await press('4');
    await press('5');
    expect(input.selectionStart).toBe(input.value.length);
  });

  it('apagar tira o último dígito (4,51 -> 0,45) e zerar esvazia o campo', async () => {
    const { fixture, input, press, backspace } = await setup();
    for (const d of '451') await press(d);
    await backspace();
    expect(input.value).toBe('0,45');
    await backspace();
    expect(input.value).toBe('0,04');
    await backspace();
    expect(input.value).toBe('');
    expect(fixture.componentInstance.value()).toBe('');
  });

  it('digitar o zero mantém 0,00 (só apagar esvazia)', async () => {
    const { input, press } = await setup();
    await press('0');
    expect(input.value).toBe('0,00');
  });

  it('letras e símbolos são ignorados', async () => {
    const { input, press } = await setup();
    await press('a');
    expect(input.value).toBe('');
    await press('7');
    await press('-');
    expect(input.value).toBe('0,07');
  });

  it('editar no meio mantém o cursor no mesmo ponto contado da direita', async () => {
    const { input, press } = await setup();
    for (const d of '1234') await press(d); // 12,34
    input.setSelectionRange(2, 2); // 12|,34
    await press('9');
    expect(input.value).toBe('129,34');
    expect(input.selectionStart).toBe(3); // 129|,34
  });

  describe('colar', () => {
    it('colar 145 vale R$ 145,00 (e não 1,45)', async () => {
      const { fixture, input, paste } = await setup();
      const event = paste('145');
      expect(event.defaultPrevented).toBe(true);
      expect(input.value).toBe('145,00');
      expect(parseNumberBR(fixture.componentInstance.value())).toBe(145);
    });

    it('colar "R$ 1.234,5" vira 1.234,50', async () => {
      const { input, paste } = await setup();
      paste('R$ 1.234,5');
      expect(input.value).toBe('1.234,50');
    });

    it('colar texto sem número deixa o navegador seguir (nada muda)', async () => {
      const { input, paste } = await setup();
      const event = paste('abc');
      expect(event.defaultPrevented).toBe(false);
      expect(input.value).toBe('');
    });
  });
});
