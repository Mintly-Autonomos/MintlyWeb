import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-toggle',
  standalone: true,
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked"
      [disabled]="disabled"
      (click)="!disabled && changed.emit(!checked)"
      [class]="
        'h-6 w-11 rounded-full relative transition ' +
        (checked ? 'bg-mint' : 'bg-muted border border-border') +
        (disabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer')
      "
    >
      <span
        [class]="
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
          (checked ? 'left-[22px]' : 'left-0.5')
        "
      ></span>
    </button>
  `,
})
export class ToggleComponent {
  @Input() checked = false;
  @Input() disabled = false;
  @Output() changed = new EventEmitter<boolean>();
}
