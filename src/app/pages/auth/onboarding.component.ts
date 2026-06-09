import { Component, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthCardComponent } from '../../layout/auth-shell.component';
import { IconComponent } from '../../shared/icon.component';

const SEGMENTS = ['Restaurante', 'Lanchonete', 'Food Truck', 'Confeitaria', 'Pizzaria', 'Outro'];

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [FormsModule, AuthCardComponent, IconComponent],
  template: `
    <app-auth-card
      [wide]="true"
      title="Configure seu perfil"
      subtitle="Nos diga um pouco mais sobre o seu negócio para personalizar sua experiência."
    >
      <form (ngSubmit)="onSubmit()" class="space-y-5">
        <div>
          <div class="text-[13px] font-medium mb-2">Segmento do negócio</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            @for (seg of segments; track seg) {
              <button
                type="button"
                (click)="segment.set(seg)"
                [class]="
                  'p-3 rounded-xl border text-[13px] font-medium text-left transition cursor-pointer ' +
                  (segment() === seg
                    ? 'border-mint bg-mint-soft text-ocean'
                    : 'border-border bg-card hover:bg-muted')
                "
              >
                {{ seg }}
              </button>
            }
          </div>
        </div>
        <div class="block">
          <span class="text-[13px] font-medium block mb-1.5">Quantos funcionários você tem?</span>
          <div class="flex gap-2">
            @for (opt of ['1-5', '6-15', '16-50', '50+']; track opt) {
              <button
                type="button"
                (click)="employees.set(opt)"
                [class]="
                  'flex-1 h-10 rounded-xl border text-[13px] font-medium transition cursor-pointer ' +
                  (employees() === opt
                    ? 'border-mint bg-mint-soft text-ocean'
                    : 'border-border bg-card hover:bg-muted')
                "
              >
                {{ opt }}
              </button>
            }
          </div>
        </div>
        <button
          type="submit"
          [disabled]="!segment() || loading()"
          class="w-full h-12 rounded-xl bg-mint text-primary-foreground font-semibold text-sm hover:brightness-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          @if (loading()) {
            <app-icon
              name="progress_activity"
              [style]="{ fontSize: '20px' }"
              className="animate-spin"
            /><span>Configurando…</span>
          } @else {
            <span>Entrar no Mintly</span
            ><app-icon name="arrow_forward" [style]="{ fontSize: '20px' }" />
          }
        </button>
      </form>
    </app-auth-card>
  `,
})
export class OnboardingComponent {
  protected router = inject(Router);
  protected segments = SEGMENTS;
  protected segment = signal('');
  protected employees = signal('');
  protected loading = signal(false);
  onSubmit(): void {
    if (!this.segment()) return;
    this.loading.set(true);
    // TODO: POST /api/auth/onboarding { segment, employees }
    setTimeout(() => this.router.navigate(['/']), 800);
  }
}
