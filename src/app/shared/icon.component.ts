import { Component, Input } from '@angular/core';
import { NgStyle } from '@angular/common';

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [NgStyle],
  template: `<span class="material-symbols-outlined" [ngStyle]="style" [class]="className">{{ name }}</span>`,
})
export class IconComponent {
  @Input() name = '';
  @Input() style: Record<string, string> = {};
  @Input() className = '';
}
