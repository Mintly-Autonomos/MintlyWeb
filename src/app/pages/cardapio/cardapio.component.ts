import { Location } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ToastService } from '../../shared/toast.service';
import { MoneyInputDirective } from '../../shared/money-input.directive';
import { moneyToInput } from '../../shared/money-input';
import { normalizeDishName } from '../../shared/dish-match';
import { formatBRL } from '../../shared/format';
import { CardapioService, Prato } from '../../services/cardapio.service';
import { parseNumberBR } from '../../services/movimentacoes.service';
import {
  diasSemRevisao,
  incompleto,
  precisaRevisar,
  tempoLabel,
} from '../../services/cardapio.builder';

const INPUT =
  'h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint';

const FORM_VAZIO = { nome: '', categoria: '', preco: '', custo: '' };

/** Por quanto tempo o prato vindo do sino/simulador fica marcado antes de o destaque sumir. */
export const DESTAQUE_MS = 4000;

/**
 * Cardápio: onde o dono vê e edita os pratos (cadastrar, mudar preço, custo e categoria, inativar).
 * A análise e a simulação de preço ficam em Previsões, que só sugere; aqui é onde se muda.
 */
@Component({
  selector: 'app-cardapio',
  standalone: true,
  imports: [IconComponent, ChipComponent, EmptyStateComponent, MoneyInputDirective, RouterLink],
  templateUrl: './cardapio.component.html',
})
export class CardapioComponent implements OnInit, OnDestroy {
  private svc = inject(CardapioService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private location = inject(Location);

  protected readonly fmtBRL = formatBRL;
  protected readonly inputClass = INPUT;

  protected loading = this.svc.loading;
  protected categorias = this.svc.categorias;
  /** Ativos primeiro, depois por nome. */
  protected pratos = computed(() =>
    [...this.svc.pratos()].sort(
      (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'),
    ),
  );

  protected busca = signal('');
  /** Pratos inativos ficam escondidos da lista; "Mostrar inativos" traz eles de volta (para reativar). */
  protected mostrarInativos = signal(false);
  /** A lista antes da busca: todos os pratos, ou só os ativos. */
  protected base = computed(() =>
    this.mostrarInativos() ? this.pratos() : this.pratos().filter((p) => p.active),
  );
  protected visiveis = computed(() => {
    const q = normalizeDishName(this.busca());
    if (!q) return this.base();
    return this.base().filter(
      (p) =>
        normalizeDishName(p.name).includes(q) || normalizeDishName(p.category ?? '').includes(q),
    );
  });
  protected inativos = computed(() => this.pratos().filter((p) => !p.active).length);
  protected incompletos = computed(() => this.pratos().filter(incompleto).length);

  protected adding = signal(false);
  protected busyId = signal<string | null>(null);
  protected editandoId = signal<string | null>(null);
  protected precoEditandoId = signal<string | null>(null);
  protected destaque = signal<string | null>(null);
  /** Preço vindo do simulador (Previsões): abre o editor de preço já preenchido para a pessoa só confirmar. */
  protected sugerido = signal<{ id: string; price: number } | null>(null);
  protected f = signal({ ...FORM_VAZIO });
  protected precoEditado = signal('');

  /** Prato a destacar (vem do sino: "Rever preço"). */
  private pendingFocus: string | null = null;
  private pendingPrice: number | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    // Quando os pratos chegam, destaca o pedido pelo sino.
    effect(() => {
      this.svc.pratos();
      this.tryFocus();
    });
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.pendingFocus = params.get('item');
    const preco = params.get('preco');
    const valor = preco === null || preco.trim() === '' ? NaN : Number(preco);
    this.pendingPrice = Number.isFinite(valor) && valor >= 0 ? valor : null;
    this.tryFocus();
    this.svc.refresh().catch(() => this.toast.error('Não foi possível carregar o cardápio.'));
  }

  private tryFocus(): void {
    const id = this.pendingFocus;
    const prato = id ? this.svc.pratos().find((x) => x.id === id) : undefined;
    if (!id || !prato) return;
    this.pendingFocus = null;
    this.destaque.set(id);
    // Veio do simulador com um preço: abre "Mudar preço" já com o valor, é só confirmar em Salvar.
    const preco = this.pendingPrice;
    this.pendingPrice = null;
    if (preco !== null && prato.active && Math.abs(preco - prato.price) >= 0.005) {
      this.iniciarPreco(prato);
      this.precoEditado.set(moneyToInput(preco));
      this.sugerido.set({ id, price: preco });
    }
    // O pedido já foi atendido: tira os parâmetros do endereço (recarregar não reabre o editor).
    this.location.replaceState('/cardapio');
    this.timers.push(
      setTimeout(
        () =>
          document
            .getElementById('cardapio-item-' + id)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        250,
      ),
      // O destaque chama a atenção para o prato e some; não fica marcado para sempre.
      setTimeout(() => this.destaque.set(null), DESTAQUE_MS),
    );
  }

  protected revisar(p: Prato): boolean {
    return precisaRevisar(p, new Date());
  }

  protected revisadoLabel(p: Prato): string {
    return tempoLabel(diasSemRevisao(p, new Date()));
  }

  /** Quanto do preço sobra depois do custo, em %; "—" enquanto o custo não foi informado. */
  protected margemLabel(p: Prato): string {
    if (!(p.cost > 0) || !(p.price > 0)) return '—';
    const pct = ((p.price - p.cost) / p.price) * 100;
    return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
  }

  protected inputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setF(campo: 'nome' | 'categoria' | 'preco' | 'custo', valor: string): void {
    this.f.update((v) => ({ ...v, [campo]: valor }));
  }

  private num(v: string): number {
    return parseNumberBR(v);
  }

  toggleAdd(): void {
    this.adding.update((v) => !v);
    this.f.set({ ...FORM_VAZIO });
  }

  async adicionar(): Promise<void> {
    const v = this.f();
    const preco = this.num(v.preco);
    const custo = v.custo.trim() === '' ? 0 : this.num(v.custo);
    if (!v.nome.trim() || v.preco.trim() === '' || !(preco >= 0)) {
      this.toast.error('Informe o nome e o preço do prato.');
      return;
    }
    if (!(custo >= 0)) {
      this.toast.error('O custo não pode ser negativo.');
      return;
    }
    this.busyId.set('novo');
    try {
      await this.svc.create({
        name: v.nome.trim(),
        price: preco,
        category: v.categoria.trim() || undefined,
        cost: custo,
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
      preco: moneyToInput(p.price),
      custo: p.cost ? moneyToInput(p.cost) : '',
    });
  }

  cancelarEdicao(): void {
    this.editandoId.set(null);
  }

  async salvarEdicao(p: Prato): Promise<void> {
    const v = this.f();
    const custo = v.custo.trim() === '' ? 0 : this.num(v.custo);
    const preco = this.num(v.preco);
    if (!v.nome.trim()) {
      this.toast.error('O prato precisa de um nome.');
      return;
    }
    if (v.preco.trim() === '' || !(preco >= 0)) {
      this.toast.error('Informe um preço válido.');
      return;
    }
    if (!(custo >= 0)) {
      this.toast.error('O custo não pode ser negativo.');
      return;
    }
    this.busyId.set(p.id);
    try {
      await this.svc.update(p.id, {
        name: v.nome.trim(),
        category: v.categoria.trim(),
        cost: custo,
      });
      // Preço só vai pelo endpoint próprio quando mudou: é ele que conta como revisão de preço.
      if (preco !== p.price) await this.svc.changePrice(p.id, preco);
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
    this.precoEditado.set(moneyToInput(p.price));
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
      this.sugerido.set(null);
      this.toast.success(
        preco === p.price ? `Preço de ${p.name} mantido.` : `Preço de ${p.name} atualizado.`,
      );
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

  async alternarAtivo(p: Prato): Promise<void> {
    this.busyId.set(p.id);
    try {
      await this.svc.setActive(p.id, !p.active);
      if (p.active) {
        this.toast.success(
          `${p.name} foi inativado e saiu da lista. Para reativar, use "Mostrar inativos".`,
        );
      }
    } catch (err) {
      this.toast.error(this.svc.errorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }
}
