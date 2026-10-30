import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';
import { fmtDateTime } from './format';

/** Evento de auditoria — compatível com os AuditEvent de contas e categorias. */
export interface AuditEntry {
  id: number;
  at: string;
  by: string;
  action: string;
  detail?: string;
  icon: string;
}

/**
 * Os eventos que a API grava no histórico de contas e categorias vêm como códigos
 * ('set-default', 'inactivate'…). Aqui viram texto de gente; o que não for código conhecido
 * (rótulos já em português, ações futuras) passa como veio.
 */
const ACTION_LABELS: Record<string, string> = {
  register: 'Criada',
  create: 'Criada',
  update: 'Dados atualizados',
  'update-name': 'Nome alterado',
  'update-fee': 'Taxa alterada',
  'update-settlement': 'Prazo de repasse alterado',
  inactivate: 'Inativada',
  reactivate: 'Reativada',
  'set-default': 'Definida como conta padrão',
  'unset-default': 'Deixou de ser a conta padrão',
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action.trim().toLowerCase()] ?? action;
}

@Component({
  selector: 'app-audit-timeline',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="space-y-2">
      @for (ev of events; track ev.id) {
        <div class="flex gap-3 text-[13px]">
          <div class="h-7 w-7 rounded-xl bg-muted grid place-items-center shrink-0 mt-0.5">
            <app-icon
              [name]="ev.icon"
              [style]="{ fontSize: '15px' }"
              className="text-muted-foreground"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium">{{ label(ev.action) }}</div>
            @if (ev.detail) {
              <div class="text-muted-foreground text-[12px]">{{ ev.detail }}</div>
            }
            <div class="text-[11px] text-muted-foreground mt-0.5">
              {{ fmtDateTime(ev.at) }} · {{ ev.by }}
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AuditTimelineComponent {
  @Input() events: AuditEntry[] = [];
  protected label = auditActionLabel;
  protected fmtDateTime = fmtDateTime;
}
