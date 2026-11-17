import { Component, Input, computed, signal } from '@angular/core';
import { formatBRL } from './format';
import type { WaterfallRow } from './waterfall-chart.component';

/** Uma linha da ponte: onde a barra começa e termina (em R$) e como ela se lê. */
export interface BridgeRow {
  label: string;
  value: number;
  kind: WaterfallRow['kind'];
  lo: number;
  hi: number;
  /** Total depois desta etapa. */
  level: number;
  /** |valor| ÷ receita × 100 (null sem receita). */
  pct: number | null;
}

/**
 * Calcula as faixas de cada etapa. \`start\` vai de 0 ao valor; \`down\`/\`up\` saem do total anterior; \`end\` é o
 * resultado, de 0 até ele (negativo fica à esquerda do zero). Pura (testada sem tela).
 */
export function bridgeRows(rows: WaterfallRow[]): BridgeRow[] {
  const receita = rows.find((r) => r.kind === 'start')?.value ?? 0;
  let level = 0;
  return rows.map((r) => {
    let lo: number;
    let hi: number;
    if (r.kind === 'start' || r.kind === 'end') {
      level = r.value;
      lo = Math.min(0, r.value);
      hi = Math.max(0, r.value);
    } else {
      const antes = level;
      level = antes + r.value;
      lo = Math.min(antes, level);
      hi = Math.max(antes, level);
    }
    return {
      label: r.label,
      value: r.value,
      kind: r.kind,
      lo,
      hi,
      level,
      pct: receita > 0 ? (Math.abs(r.value) / receita) * 100 : null,
    };
  });
}

/**
 * "Como seu lucro se forma" (pedido do Nathan, 18/11): ponte horizontal, uma linha por etapa, das vendas até o
 * resultado. Cada barra começa onde a anterior terminou; o zero fica marcado e o prejuízo aparece em vermelho,
 * à esquerda dele, com o nome escrito. Substitui a cascata vertical, que ficava difícil de ler no negativo.
 */
@Component({
  selector: 'app-profit-bridge',
  standalone: true,
  template: `
    @if (linhas().length === 0) {
      <p class="h-full grid place-items-center text-[13px] text-muted-foreground">
        Sem lançamentos no período.
      </p>
    } @else {
      <ol class="h-full flex flex-col justify-center gap-1.5" [attr.aria-label]="ariaLabel()">
        @for (l of linhas(); track l.label; let ultimo = $last) {
          <li
            [class]="
              'grid grid-cols-[minmax(96px,150px)_1fr_auto] sm:grid-cols-[minmax(120px,190px)_1fr_auto_52px] items-center gap-x-3 py-1.5 ' +
              (l.kind === 'end' ? 'border-t border-border mt-1 pt-2.5' : '')
            "
            [attr.data-testid]="'ponte-' + $index"
          >
            <span
              [class]="
                'text-[12.5px] leading-tight ' +
                (l.kind === 'end' || l.kind === 'start' ? 'font-semibold' : 'text-muted-foreground')
              "
              >{{ l.label }}</span
            >
            <span class="relative h-6 rounded-md bg-muted/50" aria-hidden="true">
              <span
                class="absolute inset-y-[-3px] w-px bg-foreground/40"
                [style.left.%]="zeroPct()"
              ></span>
              <span
                class="absolute inset-y-0 rounded-[5px]"
                [style.left.%]="pos(l.lo)"
                [style.width.%]="largura(l)"
                [style.background]="cor(l)"
              ></span>
            </span>
            <span
              [class]="
                'text-right text-[13px] tabular-nums whitespace-nowrap ' +
                (l.kind === 'end'
                  ? 'font-bold ' + (l.value < 0 ? 'text-error' : 'text-success')
                  : 'font-semibold')
              "
            >
              {{ valorTexto(l) }}
              @if (l.kind === 'end' && l.value < 0) {
                <span class="block text-[11px] font-semibold">prejuízo</span>
              }
            </span>
            <span
              class="hidden sm:block text-right text-[11.5px] text-muted-foreground tabular-nums"
            >
              {{ l.pct === null ? '' : pctTexto(l.pct) }}
            </span>
          </li>
        }
      </ol>
    }
  `,
})
export class ProfitBridgeComponent {
  private readonly rows = signal<WaterfallRow[]>([]);
  @Input() set data(value: WaterfallRow[]) {
    this.rows.set(value ?? []);
  }

  protected linhas = computed(() => {
    const r = this.rows();
    // Tudo zero: nada para mostrar (o card já tem o convite para lançar).
    return r.every((x) => x.value === 0) ? [] : bridgeRows(r);
  });

  private faixa = computed(() => {
    const l = this.linhas();
    const min = Math.min(0, ...l.map((x) => x.lo));
    const max = Math.max(0, ...l.map((x) => x.hi));
    return { min, span: max - min || 1 };
  });

  protected zeroPct = computed(() => this.pos(0));

  protected pos(v: number): number {
    const { min, span } = this.faixa();
    return ((v - min) / span) * 100;
  }

  protected largura(l: BridgeRow): number {
    // Mínimo visível para etapas pequenas (ex.: imposto de R$ 12 num mês de R$ 40 mil).
    const w = ((l.hi - l.lo) / this.faixa().span) * 100;
    return l.hi === l.lo ? 0 : Math.max(0.8, w);
  }

  protected cor(l: BridgeRow): string {
    if (l.kind === 'start') return 'var(--ocean)';
    if (l.kind === 'end') return l.value < 0 ? 'var(--error)' : 'var(--success)';
    if (l.kind === 'up') return 'color-mix(in oklab, var(--success) 70%, transparent)';
    return 'color-mix(in oklab, var(--error) 65%, transparent)';
  }

  protected valorTexto(l: BridgeRow): string {
    if (l.kind === 'down') return `− ${formatBRL(Math.abs(l.value))}`;
    if (l.kind === 'up') return `+ ${formatBRL(l.value)}`;
    return formatBRL(l.value);
  }

  protected pctTexto(p: number): string {
    return `${p < 10 ? p.toFixed(1).replace('.', ',') : Math.round(p)}%`;
  }

  protected ariaLabel = computed(() =>
    this.linhas()
      .map((l) => `${l.label}: ${this.valorTexto(l)}`)
      .join('; '),
  );
}
