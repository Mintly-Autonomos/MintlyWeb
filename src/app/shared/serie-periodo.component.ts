import { Component, Input, computed, inject, signal } from '@angular/core';
import type { TimeseriesPoint, TimeseriesReport } from 'mintly-lib';
import { ModoPeriodo, SerieService } from '../services/serie.service';
import { BarChartComponent, BarSeries } from './bar-chart.component';
import { LineChartComponent, LineSeries } from './line-chart.component';
import { StackedBarsComponent, StackedSeries } from './stacked-bars.component';
import { formatCompact } from './format';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const rotulo = (key: string) =>
  key.length === 7
    ? `${MESES[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`
    : `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/**
 * Seletor Dia / Semana / Mês / Ano de um gráfico dos relatórios (P.3 / relatório 12.4). Em "Mês" mostra o gráfico
 * da própria tela (o conteúdo projetado, sem mudança); em Dia, Semana e Ano busca a série na API e desenha o seu,
 * com o eixo recalculado a cada troca. "Ano" = 12 meses com o mesmo mês do ano anterior tracejado.
 *
 * - `resultado`: lucro de cada período (verde lucro, vermelho prejuízo);
 * - `custos`: CMV e outras despesas empilhados;
 * - `caixa`: entradas e saídas (pelo caixa).
 */
@Component({
  selector: 'app-serie-periodo',
  standalone: true,
  imports: [BarChartComponent, LineChartComponent, StackedBarsComponent],
  template: `
    <div class="h-full flex flex-col">
      <div class="flex flex-wrap items-center justify-end gap-2 mb-2">
        @if (nota && modo() !== 'mes') {
          <span class="mr-auto text-[11.5px] text-muted-foreground" data-testid="periodo-nota">{{
            nota
          }}</span>
        }
        <div
          class="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-card"
          role="group"
          aria-label="Ver por"
        >
          @for (m of modos; track m.key) {
            <button
              type="button"
              (click)="trocar(m.key)"
              [attr.aria-pressed]="modo() === m.key"
              [attr.data-testid]="'periodo-' + m.key"
              [class]="
                'h-7 px-3 rounded-full text-[12px] font-semibold transition-colors cursor-pointer ' +
                (modo() === m.key
                  ? 'bg-mint-soft text-ocean'
                  : 'text-muted-foreground hover:bg-muted')
              "
            >
              {{ m.label }}
            </button>
          }
        </div>
      </div>
      <div class="flex-1 min-h-0">
        @if (modo() === 'mes') {
          <ng-content />
        } @else if (carregando()) {
          <div class="h-full w-full rounded-xl bg-muted animate-pulse"></div>
        } @else if (erro()) {
          <p class="h-full grid place-items-center text-[13px] text-muted-foreground" role="alert">
            {{ erro() }}
          </p>
        } @else if (modo() === 'ano') {
          <app-line-chart
            [data]="dadosAno()"
            categoryKey="rotulo"
            [series]="seriesAno()"
            [valueFormatter]="abrev"
          />
        } @else if (metrica === 'custos') {
          <app-stacked-bars
            [data]="dados()"
            categoryKey="rotulo"
            [series]="seriesCustos"
            [valueFormatter]="abrev"
          />
        } @else if (metrica === 'caixa') {
          <app-bar-chart
            [data]="dados()"
            categoryKey="rotulo"
            [series]="seriesCaixa"
            orientation="columns"
            [valueFormatter]="abrev"
          />
        } @else {
          <app-bar-chart
            [data]="dados()"
            categoryKey="rotulo"
            [series]="seriesLucro"
            orientation="columns"
            [valueFormatter]="abrev"
            [colorFor]="corLucro"
          />
        }
      </div>
    </div>
  `,
})
export class SeriePeriodoComponent {
  private svc = inject(SerieService);

  @Input({ required: true }) metrica!: 'resultado' | 'custos' | 'caixa';
  /** Texto curto que aparece fora do "Mês" (ex.: no Fluxo, Dia/Semana/Ano são o realizado, não a projeção). */
  @Input() nota = '';

  protected readonly modos: { key: ModoPeriodo; label: string }[] = [
    { key: 'dia', label: 'Dia' },
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mês' },
    { key: 'ano', label: 'Ano' },
  ];
  protected readonly abrev = formatCompact;
  protected modo = signal<ModoPeriodo>('mes');
  protected carregando = signal(false);
  protected erro = signal<string | null>(null);
  protected serie = signal<TimeseriesReport | null>(null);

  protected readonly seriesLucro: BarSeries[] = [
    { key: 'profit', name: 'Lucro', color: 'var(--success)' },
  ];
  protected readonly seriesCaixa: BarSeries[] = [
    { key: 'cashIn', name: 'Entradas', color: 'var(--success)' },
    { key: 'cashOut', name: 'Saídas', color: 'var(--error)' },
  ];
  protected readonly seriesCustos: StackedSeries[] = [
    { key: 'cmv', name: 'CMV (insumos)', color: 'var(--warning)' },
    { key: 'expenses', name: 'Outras despesas', color: 'var(--ocean)' },
  ];
  protected corLucro = (d: unknown): string =>
    ((d as { profit: number }).profit ?? 0) < 0 ? 'var(--error)' : 'var(--success)';

  protected dados = computed(() =>
    (this.serie()?.points ?? []).map((p) => ({ ...p, rotulo: rotulo(p.key) })),
  );

  /** O número de cada mês no "Ano": lucro, custo total ou saldo do caixa (entradas − saídas). */
  private valor = (p: TimeseriesPoint): number =>
    this.metrica === 'custos'
      ? p.cmv + p.expenses
      : this.metrica === 'caixa'
        ? p.cashIn - p.cashOut
        : p.profit;
  protected dadosAno = computed(() => {
    const s = this.serie();
    if (!s) return [];
    return s.points.map((p, i) => ({
      rotulo: rotulo(p.key),
      atual: Math.round(this.valor(p) * 100) / 100,
      anterior: s.previousYear?.[i] ? Math.round(this.valor(s.previousYear[i]) * 100) / 100 : 0,
    }));
  });
  protected seriesAno = computed<LineSeries[]>(() => {
    const nome =
      this.metrica === 'custos'
        ? 'Custos e despesas'
        : this.metrica === 'caixa'
          ? 'Entradas − saídas'
          : 'Lucro';
    return [
      { key: 'atual', name: nome, color: 'var(--ocean)' },
      { key: 'anterior', name: 'Ano anterior', color: 'var(--muted-foreground)', dashed: true },
    ];
  });

  async trocar(m: ModoPeriodo): Promise<void> {
    this.modo.set(m);
    if (m === 'mes') return;
    this.carregando.set(true);
    this.erro.set(null);
    try {
      this.serie.set(await this.svc.buscar(m));
    } catch {
      this.erro.set('Não foi possível carregar este período. Tente de novo.');
    } finally {
      this.carregando.set(false);
    }
  }
}
