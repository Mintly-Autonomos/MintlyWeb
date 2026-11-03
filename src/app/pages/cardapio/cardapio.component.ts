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
  protected visiveis = computed(() => {
    const q = normalizeDishName(this.busca());
    if (!q) return this.pratos();
    return this.pratos().filter(
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
  protected f = signal({ ...FORM_VAZIO });
  protected precoEditado = signal('');

  /** Prato a destacar (vem do sino: "Rever preço"). */
  private pendingFocus: string | null = null;
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
    this.pendingFocus = this.route.snapshot.queryParamMap.get('item');
    this.tryFocus();
    this.svc.refresh().catch(() => this.toast.error('Não foi possível carregar o cardápio.'));
  }

  private tryFocus(): void {
    const id = this.pendingFocus;
    if (!id || !this.svc.pratos().some((x) => x.id === id)) return;
    this.pendingFocus = null;
    this.destaque.set(id);
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

  /** Preço menos custo e quanto isso é do preço; "—" enquanto o custo não foi informado. */
  protected margemLabel(p: Prato): string {
    if (!(p.cost > 0) || !(p.price > 0)) return '—';
    const margem = p.price - p.cost;
    const pct = (margem / p.price) * 100;
    return `${formatBRL(margem)} (${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%)`;
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
    } catch (err) {
      this.toast.error(this.svc.errorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }
}
