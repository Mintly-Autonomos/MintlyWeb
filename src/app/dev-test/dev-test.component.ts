import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ModalComponent } from '../modal/modal.component';
import { PopupComponent, PopupItem } from '../popup/popup.component';

// TODO: Todo novo componente criado deve incluir uma tela de visualização no repositório para que a IA possa encontrar e testar facilmente suas variações.
interface DevExample {
  label: string;
  type: 'modal' | 'popup';
  title: string;
  status: 'success' | 'error' | 'warning' | 'information';
  size?: string;
  position?: 'top-left' | 'top-right';
  duration?: number;
  message: string;
}

@Component({
  selector: 'app-dev-test',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, ModalComponent, PopupComponent],
  templateUrl: './dev-test.component.html',
  styleUrls: ['./dev-test.component.css'],
})
export class DevTestComponent {
  @Output() closeView = new EventEmitter<void>();
  @Output() toggleNavbar = new EventEmitter<void>();

  protected readonly examples: DevExample[] = [
    {
      label: 'Sucesso central',
      type: 'modal',
      title: 'Sucesso',
      status: 'success',
      size: 'm',
      message: 'Operação concluída com êxito.',
    },
    {
      label: 'Erro popup canto direito',
      type: 'popup',
      title: 'Erro',
      status: 'error',
      position: 'top-right',
      duration: 4,
      message: 'Algo deu errado. Verifique o sistema.',
    },
    {
      label: 'Aviso popup canto esquerdo',
      type: 'popup',
      title: 'Aviso',
      status: 'warning',
      position: 'top-left',
      duration: 5,
      message: 'Atenção: ajuste suas configurações antes de continuar.',
    },
    {
      label: 'Informação central',
      type: 'modal',
      title: 'Atualização importante',
      status: 'information',
      size: 's',
      message: 'Esta é uma mensagem informativa sem ícone especial.',
    },
    {
      label: 'Tamanho inválido',
      type: 'modal',
      title: 'Validação',
      status: 'warning',
      size: 'x',
      message: 'Tamanho inválido deve exibir erro de validação.',
    },
  ];

  protected readonly selectedExample = signal<DevExample | null>(null);
  protected readonly activePopups = signal<PopupItem[]>([]);

  protected openExample(example: DevExample): void {
    if (example.type === 'popup') {
      this.activePopups.set([
        ...this.activePopups(),
        {
          id: `popup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: example.title,
          message: example.message,
          status: example.status,
          position: example.position ?? 'top-right',
          duration: example.duration ?? 4,
        },
      ]);
      return;
    }

    this.selectedExample.set(example);
  }

  protected closeModal(): void {
    this.selectedExample.set(null);
  }

  protected closePopup(id: string): void {
    this.activePopups.set(this.activePopups().filter((popup) => popup.id !== id));
  }

  protected toggleNavbarType(): void {
    this.toggleNavbar.emit();
  }

  protected backToHome(): void {
    this.closeView.emit();
  }
}
