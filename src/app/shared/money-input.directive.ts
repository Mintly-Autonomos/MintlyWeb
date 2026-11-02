import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { formatMoneyInput, pasteMoneyInput } from './money-input';

/**
 * Campo de dinheiro estilo caixa eletrônico: os dígitos entram pelos centavos (4 -> 0,04, 5 -> 0,45,
 * 1 -> 4,51). O cursor fica no mesmo ponto contado a partir da direita, então editar no meio não pula.
 * Usar junto do `ngModel`/`(input)`: o evento `input` é reemitido para o modelo receber o texto já formatado.
 */
@Directive({ selector: 'input[appMoneyInput]', standalone: true })
export class MoneyInputDirective {
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = this.el;
    const caret = input.selectionStart ?? input.value.length;
    const digitsAfter = input.value.slice(caret).replace(/\D/g, '').length;
    let formatted = formatMoneyInput(input.value);
    // Apagar até zerar esvazia o campo (volta o "0,00" cinza); o 0,00 só fica se a pessoa digitou o zero.
    const deleting = (event as InputEvent).inputType?.startsWith('delete') ?? false;
    if (deleting && formatted === '0,00') formatted = '';
    if (formatted === input.value) return;

    input.value = formatted;
    let position = formatted.length;
    let seen = 0;
    while (position > 0 && seen < digitsAfter) {
      position--;
      if (/\d/.test(formatted[position])) seen++;
    }
    input.setSelectionRange(position, position);
    // O ngModel já leu o texto cru neste mesmo evento: avisa de novo com o texto formatado.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Colar "145" ou "R$ 1.234,5" vale como número, não como centavos; substitui o campo todo. */
  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!/\d/.test(text)) return;
    event.preventDefault();
    this.el.value = pasteMoneyInput(text);
    this.el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
