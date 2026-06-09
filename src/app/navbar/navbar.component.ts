import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

export interface NavItem {
  label: string;
  id: string;
  icon?: string;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent {
  @Input() position: 'top' | 'lateral' = 'top';
  @Input() items: NavItem[] = [];
  @Output() itemClick = new EventEmitter<string>();

  protected onItemClick(item: NavItem): void {
    this.itemClick.emit(item.id);
  }
}
