import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-esqueci-senha',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthCardComponent, IconComponent],
  template: `
    <app-auth-card title="Recuperar senha" subtitle="Informe seu e-mail e enviaremos um link para você criar uma nova senha." [hasFooter]="true">
      @if (!sent()) {
        <form (ngSubmit)="onSubmit()" class="space-y-4">
          <label class="block">
            <span class="text-[13px] font-medium block mb-1.5">E-mail</span>
            <span class="flex items-center h-12 rounded-xl border bg-card px-3.5 gap-2.5 focus-within:ring-2 focus-within:ring-mint/40 focus-within:border-mint border-border">
              <app-icon name="mail" [style]="{fontSize:'20px'}" className="text-muted-foreground" />
              <input type="email" [(ngModel)]="email" name="email" placeholder="voce@restaurante.com" class="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground" />
            </span>
          </label>
          <button type="submit" [disabled]="loading()" class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
            @if (loading()) { <app-icon name="progress_activity" [style]="{fontSize:'20px'}" className="animate-spin" /><span>Enviando…</span> }
            @else { <span>Enviar link de recuperação</span><app-icon name="send" [style]="{fontSize:'20px'}" /> }
          </button>
        </form>
      } @else {
        <div class="text-center space-y-4">
          <div class="mx-auto h-16 w-16 rounded-2xl bg-mint-soft grid place-items-center"><app-icon name="mark_email_read" [style]="{fontSize:'32px'}" className="text-ocean" /></div>
          <div><div class="font-semibold text-[15px]">E-mail enviado!</div><p class="text-[13px] text-muted-foreground mt-1">Verifique sua caixa de entrada em <strong>{{ email }}</strong> e siga as instruções.</p></div>
          <button type="button" (click)="router.navigate(['/auth/login'])" class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"><span>Voltar ao login</span></button>
        </div>
      }
      <div slot="footer">
        <a routerLink="/auth/login" class="text-ocean font-semibold hover:underline">← Voltar ao login</a>
      </div>
    </app-auth-card>
  `,
})
export class EsqueciSenhaComponent {
  protected router = inject(Router);
  protected email = '';
  protected loading = signal(false);
  protected sent = signal(false);

  onSubmit(): void {
    if (!this.email) return;
    this.loading.set(true);
    // TODO: POST /api/auth/forgot-password { email }
    setTimeout(() => { this.loading.set(false); this.sent.set(true); }, 800);
  }
}
