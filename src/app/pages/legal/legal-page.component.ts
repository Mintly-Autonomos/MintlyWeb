import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../shared/logo.component';
import { IconComponent } from '../../shared/icon.component';

export interface LegalSection {
  title: string;
  /** Parágrafos da seção. */
  paragraphs?: string[];
  /** Lista de itens, mostrada depois dos parágrafos. */
  items?: string[];
}

/**
 * Página de texto legal (Termos de Uso, Política de Privacidade). Pública: abre em outra aba a partir do
 * cadastro, sem tirar a pessoa do fluxo de criação de conta.
 */
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink, LogoComponent, IconComponent],
  template: `
    <div class="min-h-screen w-full bg-background text-foreground">
      <main class="mx-auto w-full max-w-[760px] px-5 py-10 md:py-14">
        <div class="mb-8">
          <app-logo [size]="32" to="/auth/login" variant="gradient" />
        </div>

        <article class="m3-card p-6 md:p-10">
          <h1
            class="text-[24px] md:text-[28px] font-bold tracking-tight"
            data-testid="legal-titulo"
          >
            {{ title }}
          </h1>
          <p class="text-[12.5px] text-muted-foreground mt-1.5">
            Última atualização: {{ updated }}
          </p>
          <p class="text-[14px] text-foreground/80 leading-relaxed mt-5">{{ intro }}</p>

          <nav aria-label="Neste documento" class="mt-6 rounded-xl bg-muted/50 p-4">
            <div class="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Neste documento
            </div>
            <ol class="mt-2 grid gap-1 text-[13.5px] sm:grid-cols-2">
              @for (s of sections; track s.title; let i = $index) {
                <li>
                  <a [href]="'#secao-' + (i + 1)" class="text-ocean hover:underline"
                    >{{ i + 1 }}. {{ s.title }}</a
                  >
                </li>
              }
            </ol>
          </nav>

          @for (s of sections; track s.title; let i = $index) {
            <section [id]="'secao-' + (i + 1)" class="mt-8 scroll-mt-6">
              <h2 class="text-[17px] font-bold tracking-tight">{{ i + 1 }}. {{ s.title }}</h2>
              @for (p of s.paragraphs ?? []; track $index) {
                <p class="text-[14px] text-foreground/80 leading-relaxed mt-2.5">{{ p }}</p>
              }
              @if (s.items?.length) {
                <ul class="mt-2.5 space-y-1.5 text-[14px] text-foreground/80 leading-relaxed">
                  @for (it of s.items; track $index) {
                    <li class="flex items-start gap-2">
                      <span class="mt-2 h-1.5 w-1.5 rounded-full bg-mint shrink-0"></span
                      ><span>{{ it }}</span>
                    </li>
                  }
                </ul>
              }
            </section>
          }
        </article>

        <p class="mt-6 text-center text-[13px] text-muted-foreground">
          <a [routerLink]="otherLink" class="text-ocean font-medium hover:underline">{{
            otherLabel
          }}</a>
        </p>
      </main>
    </div>
  `,
})
export class LegalPageComponent {
  @Input() title = '';
  @Input() updated = '';
  @Input() intro = '';
  @Input() sections: LegalSection[] = [];
  @Input() otherLink = '/';
  @Input() otherLabel = '';
}
