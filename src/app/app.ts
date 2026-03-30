import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ModalComponent } from './modal/modal.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, ModalComponent, MatButtonModule, MatCardModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App {
  protected readonly title = signal('mintly-front-end');
  protected readonly showModal = signal(false);

  protected openModal(): void {
    this.showModal.set(true);
  }

  protected closeModal(): void {
    this.showModal.set(false);
  }
}
