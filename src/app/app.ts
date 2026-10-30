import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { IdleSessionService } from './services/idle-session.service';
import { ToastContainerComponent } from './shared/toast-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.html',
})
export class App {
  private auth = inject(AuthService);
  private idle = inject(IdleSessionService);

  constructor() {
    // Logado: vigia a inatividade. Deslogado (login, cadastro, sessão encerrada): não há o que vigiar.
    effect(() => (this.auth.isAuthenticated() ? this.idle.start() : this.idle.stop()));
  }
}
