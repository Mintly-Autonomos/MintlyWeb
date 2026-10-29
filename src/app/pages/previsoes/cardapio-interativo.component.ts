import { Component, Input, computed, effect, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { ScatterChartComponent, ScatterPoint } from '../../shared/scatter-chart.component';
import { ToastService } from '../../shared/toast.service';
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
  incompleto,
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

const INPUT =
  'h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint';

/**
 * "Meu cardápio": análise de cardápio (menu engineering) com simulador de preço por prato, igual ao
 * protótipo — quatro grupos pelas médias de vendidos e de margem, painel para simular o preço (o
 * prato muda de grupo na hora) e gráfico sob demanda. Os dados são os pratos reais; custo e vendidos
 * no mês são informados pelo dono na tabela "Gerenciar cardápio", logo abaixo.
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
  ],
  templateUrl: './cardapio-interativo.component.html',
})
export class CardapioInterativoComponent {
  private svc = inject(CardapioService);
  private toast = inject(ToastService);

  /** Prato a abrir já selecionado (vindo do sino: "Rever preço"). */
  @Input() set initialItem(id: string | null) {
    this.pendingFocus = id;
    this.tryFocus();
  }

  protected readonly ORDEM = ORDEM_QUADRANTES;
  protected readonly QUADRANTES = QUADRANTES;
  protected readonly fmtBRL = formatBRL;
  protected readonly inputClass = INPUT;
  protected readonly Math = Math;

  protected loading = this.svc.loading;
  protected pratos = computed(() =>
    [...this.svc.pratos()].sort(
      (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'),
    ),
  );
  protected categorias = this.svc.categorias;

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

  // ── gerenciar cardápio ──
  protected incompletos = computed(() => this.pratos().filter(incompleto).length);
  protected adding = signal(false);
  protected busyId = signal<string | null>(null);
  protected editandoId = signal<string | null>(null);
  protected precoEditandoId = signal<string | null>(null);
  protected f = signal({ nome: '', categoria: '', preco: '', custo: '', vendidos: '' });
  protected precoEditado = signal('');

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
    if (this.analise().itens.some((i) => i.id === id)) this.selecionado.set(id);
    setTimeout(
      () =>
        document
          .getElementById(this.selecionado() === id ? 'cardapio-simulador' : 'cardapio-item-' + id)
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

  /** Grava o preço simulado (muda o valor e conta como revisão do preço). */
  async aplicarPreco(id: string): Promise<void> {
    const preco = this.precos()[id];
    if (preco === undefined) return;
    this.busyId.set(id);
    try {
      await this.svc.changePrice(id, preco);
      this.voltarPreco(id);
      this.toast.success('Preço atualizado.');
    } catch (err) {
      this.toast.error(this.svc.errorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }

  async manterPreco(p: Prato): Promise<void> {
    this.busyId.set(p.id);
    try {
      await this.svc.keepPrice(p.id);
      this.toast.success(`Certo! Só voltamos a avisar sobre ${p.name} daqui a uns 5 meses e meio.`);
    } catch (err) {
      this.toast.error(this.svc.errorMessage(err));
    } finally {
      this.busyId.set(null);
    }
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

  protected inputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setF(
    campo: 'nome' | 'categoria' | 'preco' | 'custo' | 'vendidos',
    valor: string,
  ): void {
    this.f.update((v) => ({ ...v, [campo]: valor }));
  }

  private num(v: string): number {
    return Number(v.replace(',', '.'));
  }

  toggleAdd(): void {
    this.adding.update((v) => !v);
    this.f.set({ nome: '', categoria: '', preco: '', custo: '', vendidos: '' });
  }

  async adicionar(): Promise<void> {
    const v = this.f();
    const preco = this.num(v.preco);
    const custo = v.custo.trim() === '' ? 0 : this.num(v.custo);
    const vendidos = v.vendidos.trim() === '' ? 0 : Math.round(this.num(v.vendidos));
    if (!v.nome.trim() || v.preco.trim() === '' || !(preco >= 0)) {
      this.toast.error('Informe o nome e o preço do prato.');
      return;
    }
    if (!(custo >= 0) || !(vendidos >= 0)) {
      this.toast.error('Custo e vendidos no mês não podem ser negativos.');
      return;
    }
    this.busyId.set('novo');
    try {
      await this.svc.create({
        name: v.nome.trim(),
        price: preco,
        category: v.categoria.trim() || undefined,
        cost: custo,
        soldPerMonth: vendidos,
      });
      this.adding.set(false);
      this.toast.success('Prato adicionado ao cardápio.');
    } catch (err) {
      this.toast.error(this.svc.errorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }

  iniciarEdicao(p: Prato): void {
    this.precoEditandoId.set(null);
    this.editandoId.set(p.id);
    this.f.set({
      nome: p.name,
      categoria: p.category ?? '',
      preco: String(p.price).replace('.', ','),
      custo: p.cost ? String(p.cost).replace('.', ',') : '',
      vendidos: p.soldPerMonth ? String(p.soldPerMonth) : '',
    });
  }

  cancelarEdicao(): void {
    this.editandoId.set(null);
  }

  async salvarEdicao(p: Prato): Promise<void> {
    const v = this.f();
    const custo = v.custo.trim() === '' ? 0 : this.num(v.custo);
    const vendidos = v.vendidos.trim() === '' ? 0 : Math.round(this.num(v.vendidos));
    const preco = this.num(v.preco);
    if (!v.nome.trim()) {
      this.toast.error('O prato precisa de um nome.');
      return;
    }
    if (v.preco.trim() === '' || !(preco >= 0)) {
      this.toast.error('Informe um preço válido.');
      return;
    }
    if (!(custo >= 0) || !(vendidos >= 0)) {
      this.toast.error('Custo e vendidos no mês não podem ser negativos.');
      return;
    }
    this.busyId.set(p.id);
    try {
      await this.svc.update(p.id, {
        name: v.nome.trim(),
        category: v.categoria.trim(),
        cost: custo,
        soldPerMonth: vendidos,
      });
      // Preço só vai pelo endpoint próprio quando mudou: é ele que conta como revisão de preço.
      if (preco !== p.price) {
        await this.svc.changePrice(p.id, preco);
        this.voltarPreco(p.id);
      }
      this.editandoId.set(null);
      this.toast.success('Dados do prato atualizados.');
    } catch (err) {
      this.toast.error(this.svc.errorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }

  iniciarPreco(p: Prato): void {
    this.editandoId.set(null);
    this.precoEditandoId.set(p.id);
    this.precoEditado.set(String(p.price).replace('.', ','));
  }

  async salvarPreco(p: Prato): Promise<void> {
    const preco = this.num(this.precoEditado());
    if (this.precoEditado().trim() === '' || !(preco >= 0)) {
      this.toast.error('Informe um preço válido.');
      return;
    }
    this.busyId.set(p.id);
    try {
      await this.svc.changePrice(p.id, preco);
      this.precoEditandoId.set(null);
      this.voltarPreco(p.id);
      this.toast.success(
        preco === p.price ? `Preço de ${p.name} mantido.` : `Preço de ${p.name} atualizado.`,
      );
    } catch (err) {
      this.toast.error(this.svc.errorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }

  async alternarAtivo(p: Prato): Promise<void> {
    this.busyId.set(p.id);
    try {
      await this.svc.setActive(p.id, !p.active);
      if (this.selecionado() === p.id && p.active) this.selecionado.set(null);
    } catch (err) {
      this.toast.error(this.svc.errorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }
}
