import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { formatMoneyInput } from './money-input';

/**
 * Formata o campo de dinheiro enquanto a pessoa digita, mantendo o cursor no lugar (conta quantos
 * dígitos/vírgula havia antes do cursor e reposiciona depois de inserir os pontos de milhar).
 * Usar junto do `ngModel`: o evento `input` é reemitido para o modelo receber o texto já formatado.
 */
@Directive({ selector: 'input[appMoneyInput]', standalone: true })
export class MoneyInputDirective {
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  @HostListener('input')
  onInput(): void {
    const input = this.el;
    const caret = input.selectionStart ?? input.value.length;
    const significantBefore = input.value.slice(0, caret).replace(/[^\d,]/g, '').length;
    const formatted = formatMoneyInput(input.value);
    if (formatted === input.value) return;

    input.value = formatted;
    let seen = 0;
    let position = formatted.length;
    if (significantBefore === 0) position = 0;
    else {
      for (let i = 0; i < formatted.length; i++) {
        if (/[\d,]/.test(formatted[i])) seen++;
        if (seen === significantBefore) {
          position = i + 1;
          break;
        }
      }
    }
    input.setSelectionRange(position, position);
    // O ngModel já leu o texto cru neste mesmo evento: avisa de novo com o texto formatado.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
