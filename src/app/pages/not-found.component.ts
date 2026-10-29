import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Endereço que não existe: página 404 (o protótipo tem uma; antes o app jogava para o início sem avisar). */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-background px-4">
      <div class="max-w-md text-center">
        <h1 class="text-7xl font-bold text-foreground">404</h1>
        <h2 class="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          O endereço que você abriu não existe ou foi movido.
        </p>
        <div class="mt-6">
          <a
            [routerLink]="auth.isAuthenticated() ? '/' : '/auth/login'"
            class="inline-flex items-center justify-center rounded-xl bg-mint px-5 h-11 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
          >
            {{ auth.isAuthenticated() ? 'Ir para o início' : 'Ir para o login' }}
          </a>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundComponent {
  protected auth = inject(AuthService);
}
