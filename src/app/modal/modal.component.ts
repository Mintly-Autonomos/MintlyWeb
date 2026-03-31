import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

type ModalSize = 's' | 'm' | 'g';
type ModalStatus = 'success' | 'error' | 'warning' | 'information';
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.css']
})
export class ModalComponent implements OnChanges, OnDestroy {
  @Input() title = '';
  @Input() size = 's';
  @Input() status: ModalStatus = 'information';
  @Input() message = '';
  @Input() hideClose = false;
  @Input() backdropClose = true;
  @Output() close = new EventEmitter<void>();

  get sizeError(): string | null {
    if (this.size == null || this.size.toString().trim().length === 0) {
      return 'O tamanho não pode ter tão poucos caracteres.';
    }

    const raw = this.size.toString();
    if (raw.length > 1) {
      return 'O tamanho não pode ter tantos caracteres.';
    }

    if (!['s', 'm', 'g'].includes(raw.toLowerCase())) {
      return "Use apenas 's', 'm' ou 'g' para o tamanho.";
    }

    return null;
  }

  get width(): string {
    if (this.sizeError) {
      return '20%';
    }

    const value = this.size.toLowerCase();
    return value === 'g' ? '40%' : value === 'm' ? '30%' : '20%';
  }

  get statusIcon(): string {
    return {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      information: '',
    }[this.status] || '';
  }

  get closeLabel(): string {
    return {
      success: 'Entendido',
      error: 'Fechar',
      warning: 'Ok',
      information: 'Entendi',
    }[this.status] || 'Ok';
  }

  ngOnChanges(): void {
    // keep lifecycle compatibility; modal does not auto-close
  }

  ngOnDestroy(): void {
    // no auto-close timer required for central modal
  }

  private clearTimer(): void {
    // no timer cleanup needed for central modal
  }

  onClose(): void {
    this.clearTimer();
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.backdropClose && event.target === event.currentTarget) {
      this.onClose();
    }
  }
}
