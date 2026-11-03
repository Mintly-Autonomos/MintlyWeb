import { Component, Input, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { ScatterChartComponent, ScatterPoint } from '../../shared/scatter-chart.component';
import { formatBRL } from '../../shared/format';
import { CardapioService, Prato } from '../../services/cardapio.service';
import {
  ORDEM_QUADRANTES,
  QUADRANTES,
  Quadrante,
  analisar,
  diasSemRevisao,
  faixaPreco,
  impactoMes,
  precisaRevisar,
  quadranteDe,
  recalcular,
  tempoLabel,
} from '../../services/cardapio.builder';

const FORMA: Record<Quadrante, ScatterPoint['forma']> = {
  estrela: 'circle',
  cavalo: 'square',
  quebraCabeca: 'diamond',
  repensar: 'triangle',
};

/**
 * "Meu cardápio": análise de cardápio (menu engineering) com simulador de preço por prato, igual ao
 * protótipo — quatro grupos pelas médias de vendidos e de margem, painel para simular o preço (o
 * prato muda de grupo na hora) e gráfico sob demanda. Aqui só se sugere e simula: cadastrar e mudar
 * pratos (preço, custo, categoria, inativar) é na tela Cardápio.
 */
@Component({
  selector: 'app-cardapio-interativo',
  standalone: true,
  imports: [
    IconComponent,
    ChipComponent,
    HintComponent,
    EmptyStateComponent,
    ChartCardComponent,
    ScatterChartComponent,
    RouterLink,
  ],
  templateUrl: './cardapio-interativo.component.html',
})
export class CardapioInterativoComponent {
  private svc = inject(CardapioService);

  /** Prato a abrir já selecionado (vindo do sino: "Rever preço"). */
  @Input() set initialItem(id: string | null) {
    this.pendingFocus = id;
    this.tryFocus();
  }

  protected readonly ORDEM = ORDEM_QUADRANTES;
  protected readonly QUADRANTES = QUADRANTES;
  protected readonly fmtBRL = formatBRL;
  protected readonly Math = Math;

  protected loading = this.svc.loading;
  protected pratos = computed(() =>
    [...this.svc.pratos()].sort(
      (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'),
    ),
  );

  // ── análise e simulador ──
  protected precos = signal<Record<string, number>>({});
  protected selecionado = signal<string | null>(null);
  protected verGrafico = signal(false);
  protected destaque = signal<string | null>(null);

  protected analise = computed(() => analisar(this.pratos(), this.precos()));
  protected temAnalise = computed(() => this.analise().itens.length > 0);
  protected item = computed(() => {
    const id = this.selecionado();
    return id ? (this.analise().itens.find((i) => i.id === id) ?? null) : null;
  });
  protected pratoSel = computed(() => {
    const id = this.selecionado();
    return id ? (this.pratos().find((p) => p.id === id) ?? null) : null;
  });
  protected original = computed(() => {
    const p = this.pratoSel();
    return p ? recalcular(p, p.price) : null;
  });
  protected faixa = computed(() => {
    const p = this.pratoSel();
    return p ? faixaPreco(p) : null;
  });
  protected impacto = computed(() => {
    const i = this.item();
    const o = this.original();
    return i && o ? impactoMes(i, o) : 0;
  });
  protected quadranteSel = computed(() => {
    const i = this.item();
    const a = this.analise();
    return i ? quadranteDe(i, a.mediaQtd, a.mediaMargemPct) : null;
  });

  protected pontos = computed<ScatterPoint[]>(() => {
    const a = this.analise();
    return a.itens.map((i) => {
      const g = quadranteDe(i, a.mediaQtd, a.mediaMargemPct);
      return {
        id: i.id,
        nome: i.nome,
        categoria: i.categoria,
        x: i.qtd,
        y: Number(i.margemPct.toFixed(1)),
        margem: i.margem,
        grupo: g,
        grupoLabel: QUADRANTES[g].label,
        cor: QUADRANTES[g].cor,
        forma: FORMA[g],
      };
    });
  });
  protected fantasma = computed(() => {
    const i = this.item();
    const o = this.original();
    return i && o && i.alterado ? { x: o.qtd, y: Number(o.margemPct.toFixed(1)) } : null;
  });
  protected xMax = computed(() => Math.max(1, ...this.pontos().map((p) => p.x)) * 1.08);
  protected yMin = computed(() => Math.min(0, ...this.pontos().map((p) => p.y)) - 6);
  protected yMax = computed(
    () => Math.max(...this.pontos().map((p) => p.y), this.fantasma()?.y ?? 0) + 8,
  );

  private pendingFocus: string | null = null;

  constructor() {
    // Quando os pratos chegam, abre o prato pedido pelo sino (se ainda não tinha dados).
    effect(() => {
      this.svc.pratos();
      this.tryFocus();
    });
  }

  private tryFocus(): void {
    const id = this.pendingFocus;
    if (!id) return;
    const p = this.svc.pratos().find((x) => x.id === id);
    if (!p) return;
    this.pendingFocus = null;
    this.destaque.set(id);
    if (!this.analise().itens.some((i) => i.id === id)) return;
    this.selecionado.set(id);
    setTimeout(
      () =>
        document
          .getElementById('cardapio-simulador')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      250,
    );
  }

  selecionar(id: string): void {
    this.selecionado.update((s) => (s === id ? null : id));
  }

  setPreco(id: string, valor: number): void {
    this.precos.update((p) => ({ ...p, [id]: Number(valor.toFixed(2)) }));
  }

  voltarPreco(id: string): void {
    this.precos.update((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  }

  protected revisar(p: Prato): boolean {
    return precisaRevisar(p, new Date());
  }

  protected revisadoLabel(p: Prato): string {
    return tempoLabel(diasSemRevisao(p, new Date()));
  }

  protected rangeValue(e: Event): number {
    return (e.target as HTMLInputElement).valueAsNumber;
  }
}
