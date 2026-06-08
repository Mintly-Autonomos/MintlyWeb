import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-bloqueado',
  standalone: true,
  imports: [AuthCardComponent, IconComponent],
  template: `
    <app-auth-card [wide]="true" title="Conta bloqueada" subtitle="Sua conta foi temporariamente bloqueada por motivos de segurança. Entre em contato com o suporte para desbloqueá-la.">
      <div class="flex items-center justify-center mb-4">
        <div class="h-16 w-16 rounded-2xl bg-destructive/10 grid place-items-center text-destructive"><app-icon name="lock_person" [style]="{fontSize:'32px'}" /></div>
      </div>
      <div class="p-4 rounded-2xl border border-ocean/30 bg-ocean-soft text-[13px] text-foreground/90 flex gap-3 mb-4">
        <app-icon name="info" [style]="{fontSize:'20px'}" className="text-ocean shrink-0" />
        <div>Se você acredita que isso foi um erro, fale com nossa equipe pelo e-mail <strong>suporte@mintly.com.br</strong>.</div>
      </div>
      <button type="button" (click)="router.navigate(['/auth/login'])" class="w-full h-12 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted flex items-center justify-center gap-2 cursor-pointer">
        <app-icon name="arrow_back" [style]="{fontSize:'20px'}" /><span>Voltar ao login</span>
      </button>
    </app-auth-card>
  `,
})
export class BloqueadoComponent { protected router = inject(Router); }
