import { Component, Input, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AiPriceSuggestion } from 'mintly-lib';
import { AiService } from '../../services/ai.service';
import { apiErrorMessage } from '../../shared/api-error-message';
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
  private ai = inject(AiService);

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
    if (!p) return null;
    const base = faixaPreco(p);
    // A sugestão da IA pode passar do alcance normal do controle: a faixa cresce até o preço simulado.
    const atual = this.precos()[p.id] ?? p.price;
    return { ...base, max: Math.max(base.max, Math.ceil(atual / base.passo) * base.passo) };
  });

  // ── sugestão da IA ──
  protected uso = this.ai.uso;
  /** A IA é do plano Pro: no Básico o botão dá lugar a um convite para conhecer o Pro. */
  protected iaDisponivel = (): boolean => this.ai.disponivel;
  protected sugerindo = signal(false);
  protected sugestao = signal<AiPriceSuggestion | null>(null);
  protected erroIa = signal<string | null>(null);
  /** O preço sugerido foi colocado no simulador (o prato tem custo e vendas, então está na análise). */
  protected aplicada = signal(false);
  protected semChamadas = computed(() => this.uso()?.remainingToday === 0);
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
    void this.ai.carregarUso();
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

  /**
   * Pede à IA o aumento ideal do prato que está há mais tempo sem mudar de preço. Se o prato está na análise
   * (tem custo e vendas), já o seleciona e coloca o preço sugerido no simulador; é só uma simulação, nada é
   * gravado no Cardápio.
   */
  async sugerirComIa(): Promise<void> {
    if (this.sugerindo()) return;
    this.sugerindo.set(true);
    this.erroIa.set(null);
    try {
      const s = await this.ai.sugerirPreco();
      this.sugestao.set(s);
      const naAnalise = this.analise().itens.some((i) => i.id === s.menuItemId);
      this.aplicada.set(naAnalise && s.increasePercent > 0);
      if (naAnalise) {
        this.selecionado.set(s.menuItemId);
        if (s.increasePercent > 0) this.setPreco(s.menuItemId, s.suggestedPrice);
      }
    } catch (err) {
      this.erroIa.set(
        apiErrorMessage(err, 'Não foi possível pedir a sugestão agora. Tente de novo.'),
      );
    } finally {
      this.sugerindo.set(false);
    }
  }

  /** `11,7%` */
  protected pct(n: number): string {
    return `${n.toFixed(1).replace('.', ',')}%`;
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
