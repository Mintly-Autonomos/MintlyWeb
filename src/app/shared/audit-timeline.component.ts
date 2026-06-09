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

@Component({
  selector: 'app-audit-timeline',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="space-y-2">
      @for (ev of events; track ev.id) {
        <div class="flex gap-3 text-[13px]">
          <div class="h-7 w-7 rounded-xl bg-muted grid place-items-center shrink-0 mt-0.5">
            <app-icon [name]="ev.icon" [style]="{fontSize:'15px'}" className="text-muted-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium">{{ ev.action }}</div>
            @if (ev.detail) { <div class="text-muted-foreground text-[12px]">{{ ev.detail }}</div> }
            <div class="text-[11px] text-muted-foreground mt-0.5">{{ fmtDateTime(ev.at) }} · {{ ev.by }}</div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AuditTimelineComponent {
  @Input() events: AuditEntry[] = [];
  protected fmtDateTime = fmtDateTime;
}
