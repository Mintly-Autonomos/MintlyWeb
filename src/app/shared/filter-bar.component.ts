import {
  Component,
  Injectable,
  Input,
  Output,
  EventEmitter,
  computed,
  inject,
  signal,
} from '@angular/core';
import { IconComponent } from './icon.component';

export interface FilterOption<T = string> {
  value: T;
  label: string;
}

/** Garante que só um app-filter-select fique aberto por vez (evita painéis sobrepostos). */
@Injectable({ providedIn: 'root' })
export class FilterDropdownCoordinator {
  readonly activeId = signal<number | null>(null);
  private nextId = 0;

  nextInstanceId(): number {
    return this.nextId++;
  }
}

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  host: { class: 'block' },
  imports: [IconComponent],
  template: `
    <div class="space-y-2">
      <div class="flex items-center gap-2 flex-wrap">
        <div
          class="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card flex-1 min-w-[200px] focus-within:border-mint focus-within:ring-2 focus-within:ring-mint/20 transition"
        >
          <app-icon
            name="search"
            className="text-muted-foreground"
            [style]="{ fontSize: '16px' }"
          />
          <input
            [value]="query"
            (input)="queryChange.emit($any($event.target).value)"
            [placeholder]="placeholder"
            class="bg-transparent outline-none text-[13px] flex-1 min-w-0 placeholder:text-muted-foreground"
          />
          @if (query) {
            <button
              type="button"
              (click)="queryChange.emit('')"
              class="text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Limpar busca"
            >
              <app-icon name="close" [style]="{ fontSize: '14px' }" />
            </button>
          }
        </div>

        <button
          type="button"
          (click)="toggleOpen()"
          [class]="
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[13px] font-medium transition cursor-pointer ' +
            (filtersOpen() || activeCount > 0
              ? 'border-border bg-muted text-foreground'
              : 'border-border bg-card text-foreground hover:bg-muted')
          "
        >
          <app-icon name="tune" [style]="{ fontSize: '16px' }" />
          Filtros
          @if (activeCount > 0) {
            <span
              class="inline-flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-mint-soft text-mint text-[10px] font-semibold"
              >{{ activeCount }}</span
            >
          }
          <app-icon
            name="expand_more"
            [style]="{
              fontSize: '16px',
              transform: filtersOpen() ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }"
          />
        </button>
      </div>

      @if (filtersOpen()) {
        <div class="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div class="flex items-center gap-2 flex-wrap">
            <ng-content />
            @if (activeCount > 0) {
              <button
                type="button"
                (click)="clearAll.emit()"
                class="ml-auto text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 h-8 rounded-md hover:bg-muted transition cursor-pointer"
              >
                <app-icon name="close" [style]="{ fontSize: '13px' }" />
                Limpar
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class FilterBarComponent {
  @Input() query = '';
  @Input() placeholder = 'Buscar…';
  @Input() activeCount = 0;
  @Output() queryChange = new EventEmitter<string>();
  @Output() clearAll = new EventEmitter<void>();

  protected filtersOpen = signal(false);

  toggleOpen(): void {
    this.filtersOpen.update((v) => !v);
  }
}

@Component({
  selector: 'app-filter-select',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="relative inline-flex">
      <button
        type="button"
        (click)="toggleOpen()"
        [class]="
          'inline-flex items-center gap-1 h-8 pl-2.5 pr-1.5 rounded-md border bg-card text-[13px] transition-colors duration-150 hover:bg-muted/60 cursor-pointer ' +
          (isDefault
            ? 'border-border text-muted-foreground'
            : 'border-mint/40 bg-mint-soft/40 text-foreground') +
          (open() ? ' ring-2 ring-mint/20 border-mint/60' : '')
        "
      >
        <span [class]="isDefault ? '' : 'font-medium'">{{ label }}</span>
        @if (!isDefault) {
          <span class="text-muted-foreground">:</span>
          <span class="font-medium truncate max-w-[160px]">{{ selectedLabel }}</span>
        }
        <app-icon
          name="expand_more"
          [style]="{
            fontSize: '14px',
            transform: open() ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s ease',
          }"
          className="text-muted-foreground ml-0.5"
        />
      </button>

      @if (open()) {
        <div
          class="absolute left-0 top-full mt-1.5 z-50 min-w-[180px] rounded-xl border border-border/60 bg-popover p-1 shadow-lg"
        >
          @for (opt of options; track opt.value) {
            <button
              type="button"
              (click)="select(opt.value)"
              [class]="
                'w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-[13px] text-left transition-colors duration-100 cursor-pointer ' +
                (opt.value === value
                  ? 'bg-mint-soft/70 text-mint font-semibold'
                  : 'text-foreground hover:bg-mint-soft/40')
              "
            >
              <app-icon
                name="check"
                [style]="{ fontSize: '14px' }"
                [className]="opt.value === value ? 'text-mint' : 'opacity-0'"
              />
              <span class="truncate">{{ opt.label }}</span>
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class FilterSelectComponent {
  @Input() value = '';
  @Input() label = '';
  @Input() options: FilterOption[] = [];
  @Output() valueChange = new EventEmitter<string>();

  private coordinator = inject(FilterDropdownCoordinator);
  private readonly id = this.coordinator.nextInstanceId();
  protected open = computed(() => this.coordinator.activeId() === this.id);

  toggleOpen(): void {
    this.coordinator.activeId.update((cur) => (cur === this.id ? null : this.id));
  }

  get isDefault(): boolean {
    return !this.value || this.value === this.options[0]?.value;
  }
  get selectedLabel(): string {
    return this.options.find((o) => o.value === this.value)?.label ?? '';
  }

  select(v: string): void {
    this.valueChange.emit(v);
    this.coordinator.activeId.set(null);
  }
}

@Component({
  selector: 'app-filter-date-range',
  standalone: true,
  template: `
    <div class="inline-flex items-center gap-1.5 h-8 px-2 rounded-md border border-border bg-card">
      <input
        type="date"
        [value]="from"
        (change)="fromChange.emit($any($event.target).value)"
        class="bg-transparent outline-none text-[13px] w-[120px]"
        aria-label="Data inicial"
      />
      <span class="text-[12px] text-muted-foreground">até</span>
      <input
        type="date"
        [value]="to"
        (change)="toChange.emit($any($event.target).value)"
        class="bg-transparent outline-none text-[13px] w-[120px]"
        aria-label="Data final"
      />
    </div>
  `,
})
export class FilterDateRangeComponent {
  @Input() from = '';
  @Input() to = '';
  @Output() fromChange = new EventEmitter<string>();
  @Output() toChange = new EventEmitter<string>();
}
