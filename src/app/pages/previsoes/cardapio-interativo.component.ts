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
import { formatBRL, localISODate } from '../../shared/format';
import { CardapioService, Prato } from '../../services/cardapio.service';
import { PriceSensitivity, SALES_PROFILE_ELASTICITY, SALES_PROFILE_LABEL } from 'mintly-lib';
import {
  ELASTICIDADE,
  SENSIBILIDADES,
  Medida,
  elasticidadeDoPrato,
  curvaLucro,
  elasticidadeMedida,
  precoOtimo,
  QUEDA_RISCO,
} from '../../services/cardapio-elasticidade';

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
    this.svc
      .pratos()
      .filter((p) => p.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  );

  // ── análise e simulador ──
  protected precos = signal<Record<string, number>>({});
  protected selecionado = signal<string | null>(null);
  protected verGrafico = signal(false);
  protected destaque = signal<string | null>(null);

  // ── P.6: elasticidade (quanto o volume cai quando o preço sobe) ──
  protected readonly SENSIBILIDADES = SENSIBILIDADES;
  protected readonly SALES_PROFILE_LABEL = SALES_PROFILE_LABEL;
  protected erroSensibilidade = signal<string | null>(null);
  protected medidas = computed(() => {
    const hoje = localISODate();
    const vendas = this.svc.vendas();
    const out: Record<string, Medida | null> = {};
    for (const p of this.pratos()) out[p.id] = elasticidadeMedida(vendas, p.id, hoje);
    return out;
  });
  /** Elasticidade de cada prato: a escolhida no prato > a medida no reajuste > o perfil da categoria. */
  protected usadas = computed(() => {
    const med = this.medidas();
    const perfis = this.svc.perfis();
    const out: Record<string, ReturnType<typeof elasticidadeDoPrato>> = {};
    for (const p of this.pratos()) out[p.id] = elasticidadeDoPrato(p, med[p.id] ?? null, perfis);
    return out;
  });
  protected elasticidades = computed(() => {
    const out: Record<string, number> = {};
    for (const [id, u] of Object.entries(this.usadas())) out[id] = u.valor;
    return out;
  });
  /** Opção marcada: a sensibilidade do prato, ou 'auto' (medida ou perfil da categoria). */
  protected sensSel = computed<PriceSensitivity | 'auto'>(
    () => this.pratoSel()?.priceSensitivity ?? 'auto',
  );
  protected usadaSel = computed(() => {
    const id = this.selecionado();
    return id ? (this.usadas()[id] ?? null) : null;
  });
  /** Rótulo do botão automático: "Medida" ou "Categoria: Balcão (−2,0)". */
  protected autoRotulo = computed(() => {
    const id = this.selecionado();
    if (!id) return '';
    const m = this.medidas()[id];
    const u = this.usadas()[id];
    if (m?.ok) return 'Medida';
    return u
      ? `Categoria: ${SALES_PROFILE_LABEL[u.perfil]} (${this.fmtE(SALES_PROFILE_ELASTICITY[u.perfil])})`
      : 'Categoria';
  });
  protected medidaSel = computed(() => {
    const id = this.selecionado();
    return id ? (this.medidas()[id] ?? null) : null;
  });
  protected elasticidadeSel = computed(() => {
    const id = this.selecionado();
    return id ? (this.elasticidades()[id] ?? ELASTICIDADE.media) : ELASTICIDADE.media;
  });
  protected otimo = computed(() => {
    const p = this.pratoSel();
    return p ? precoOtimo(p.cost, this.elasticidadeSel()) : null;
  });
  /** Curva lucro × preço, já em coordenadas do SVG (320 × 120). */
  protected curva = computed(() => {
    const p = this.pratoSel();
    const f = this.faixa();
    const i = this.item();
    if (!p || !f || !i) return null;
    const pts = curvaLucro(p, this.elasticidadeSel(), f);
    const lucros = pts.map((x) => x.lucro);
    const lo = Math.min(0, ...lucros);
    const hi = Math.max(...lucros, 1);
    const x = (preco: number) => ((preco - f.min) / (f.max - f.min || 1)) * 320;
    const y = (l: number) => 112 - ((l - lo) / (hi - lo || 1)) * 104;
    const linha = pts
      .map((q, k) => `${k ? 'L' : 'M'}${x(q.preco).toFixed(1)},${y(q.lucro).toFixed(1)}`)
      .join(' ');
    const riscos = pts.filter((q) => q.risco);
    const zona = riscos.length ? { x: x(riscos[0].preco), w: 320 - x(riscos[0].preco) } : null;
    const melhor = pts.reduce((a, b) => (b.lucro > a.lucro ? b : a));
    return {
      linha,
      zona,
      atual: { x: x(i.preco), y: y((i.preco - p.cost) * i.qtd) },
      melhor: { x: x(melhor.preco), y: y(melhor.lucro), preco: melhor.preco },
      zeroY: y(0),
    };
  });
  protected riscoSel = computed(() => {
    const i = this.item();
    const o = this.original();
    return !!i && !!o && o.qtd > 0 && i.qtd < o.qtd * (1 - QUEDA_RISCO);
  });

  /** Salva no servidor (vale em qualquer aparelho). `null`/'auto' volta à medida ou ao perfil da categoria. */
  async setSensibilidade(id: string, s: PriceSensitivity | 'auto'): Promise<void> {
    this.erroSensibilidade.set(null);
    try {
      await this.svc.setSensibilidade(id, s === 'auto' ? null : s);
    } catch (err) {
      this.erroSensibilidade.set(
        apiErrorMessage(err, 'Não foi possível salvar a sensibilidade deste prato.'),
      );
    }
  }

  /** "−1,80" (com o sinal de menos tipográfico). */
  protected fmtE(e: number): string {
    return e.toFixed(2).replace('.', ',').replace('-', '−');
  }

  /** " e as vendas devem ir de 84 para ~67 por mês" (vazio sem mudança de preço). */
  protected qtdFrase = computed(() => {
    const i = this.item();
    const o = this.original();
    if (!i || !o || !i.alterado) return '';
    return ` e as vendas devem ir de ${o.qtd} para ~${Math.round(i.qtd)} por mês`;
  });

  protected analise = computed(() => analisar(this.pratos(), this.precos(), this.elasticidades()));
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
    return i ? quadranteDe(i, a.limiarQtd, a.margemMedia) : null;
  });

  /** P.9: filtro por categoria do cardápio ('' = todas). */
  protected categoriaFiltro = signal('');
  protected categoriasMatriz = computed(() =>
    [
      ...new Set(
        this.analise()
          .itens.map((i) => i.categoria)
          .filter((c): c is string => !!c),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  );

  protected pontos = computed<ScatterPoint[]>(() => {
    const a = this.analise();
    const cat = this.categoriaFiltro();
    const itens = cat ? a.itens.filter((i) => i.categoria === cat) : a.itens;
    // P.9: o tamanho do ponto segue o lucro total do prato (margem por unidade × vendidos).
    const lucroMax = Math.max(1, ...itens.map((i) => Math.max(0, i.margem * i.qtd)));
    return itens.map((i) => {
      const g = quadranteDe(i, a.limiarQtd, a.margemMedia);
      return {
        escala: 0.75 + 0.85 * Math.sqrt(Math.max(0, i.margem * i.qtd) / lucroMax),
        rotulo: itens.length <= 25,
        id: i.id,
        nome: i.nome,
        categoria: i.categoria,
        x: i.qtd,
        y: Number(i.margem.toFixed(2)),
        margemPct: i.margemPct,
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
    return i && o && i.alterado ? { x: o.qtd, y: Number(o.margem.toFixed(2)) } : null;
  });
  protected xMax = computed(() => Math.max(1, ...this.pontos().map((p) => p.x)) * 1.08);
  /** Eixo da margem em R$: folga de 8% da faixa (mínimo R$ 1) para os pontos não colarem na borda. */
  private folgaY = computed(() => {
    const ys = this.pontos().map((p) => p.y);
    return Math.max(1, (Math.max(0, ...ys, this.fantasma()?.y ?? 0) - Math.min(0, ...ys)) * 0.08);
  });
  protected yMin = computed(() => Math.min(0, ...this.pontos().map((p) => p.y)) - this.folgaY());
  protected yMax = computed(
    () => Math.max(0, ...this.pontos().map((p) => p.y), this.fantasma()?.y ?? 0) + this.folgaY(),
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
