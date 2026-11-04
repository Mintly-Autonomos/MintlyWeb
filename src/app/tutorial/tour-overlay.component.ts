import { Component, ElementRef, OnDestroy, effect, inject, signal, viewChild } from '@angular/core';
import { TourService, findTourTarget } from './tour.service';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}
interface Pos {
  top: number;
  left: number;
}
interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const FOLGA = 6; // quanto o destaque passa da borda do elemento
const DISTANCIA = 40; // espaço entre o destaque e o cartão (onde passa a linha)
const MARGEM = 12; // distância mínima do cartão às bordas da tela
const ALTURA_CABECALHO = 76; // cabeçalho fixo: o alvo não pode ficar por baixo dele

/**
 * Camada do tutorial: escurece a tela, destaca o elemento do passo atual, mostra o cartão com a explicação e liga
 * os dois com uma linha. Teclado: ← → navegam, Esc fecha. Só lê a tela; não clica em nada por você.
 */
@Component({
  selector: 'app-tour-overlay',
  standalone: true,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    @if (tour.current(); as step) {
      <!-- Segura os cliques: durante o tutorial a página de trás não reage. -->
      <div class="fixed inset-0 z-[90]" aria-hidden="true" data-testid="tour-fundo"></div>

      @if (spot(); as s) {
        <div
          class="fixed z-[91] rounded-2xl pointer-events-none ring-2 ring-mint transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style="box-shadow: 0 0 0 9999px rgba(8, 16, 24, 0.62)"
          [style.top.px]="s.top"
          [style.left.px]="s.left"
          [style.width.px]="s.width"
          [style.height.px]="s.height"
          data-testid="tour-destaque"
        ></div>
      }

      @if (line(); as l) {
        <svg
          class="fixed inset-0 z-[92] h-full w-full pointer-events-none text-mint"
          aria-hidden="true"
          data-testid="tour-linha"
        >
          <line
            [attr.x1]="l.x1"
            [attr.y1]="l.y1"
            [attr.x2]="l.x2"
            [attr.y2]="l.y2"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
          <circle [attr.cx]="l.x2" [attr.cy]="l.y2" r="4.5" fill="currentColor" />
        </svg>
      }

      <div
        #cartao
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        aria-describedby="tour-texto"
        [class]="
          'fixed z-[93] w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-card p-4 shadow-2xl ' +
          (pos() ? '' : 'invisible')
        "
        [style.top.px]="pos()?.top ?? 0"
        [style.left.px]="pos()?.left ?? 0"
        data-testid="tour-cartao"
      >
        <div class="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Passo {{ tour.index() + 1 }} de {{ tour.total() }}
        </div>
        <h3 id="tour-titulo" class="mt-1 text-[15px] font-bold tracking-tight">
          {{ step.title }}
        </h3>
        <p id="tour-texto" class="mt-1.5 text-[13px] leading-relaxed text-foreground/80">
          {{ step.text }}
        </p>
        <div class="mt-4 flex items-center gap-2">
          <button
            type="button"
            (click)="tour.stop()"
            class="h-9 rounded-full px-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            data-testid="tour-pular"
          >
            Pular tutorial
          </button>
          <div class="ml-auto flex items-center gap-2">
            @if (!tour.isFirst()) {
              <button
                type="button"
                (click)="tour.prev()"
                class="h-9 rounded-full border border-border px-4 text-[13px] font-semibold hover:bg-muted cursor-pointer"
                data-testid="tour-voltar"
              >
                Voltar
              </button>
            }
            <button
              #proximo
              type="button"
              (click)="tour.next()"
              class="h-9 rounded-full bg-mint px-4 text-[13px] font-semibold text-primary-foreground hover:brightness-95 cursor-pointer"
              data-testid="tour-proximo"
            >
              {{ tour.isLast() ? 'Concluir' : 'Próximo' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TourOverlayComponent implements OnDestroy {
  protected tour = inject(TourService);

  protected spot = signal<Box | null>(null);
  protected pos = signal<Pos | null>(null);
  protected line = signal<Line | null>(null);

  private cartao = viewChild<ElementRef<HTMLElement>>('cartao');
  private proximo = viewChild<ElementRef<HTMLButtonElement>>('proximo');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frame: number | null = null;
  private rodando = false;

  constructor() {
    // A cada passo: leva o alvo para a tela, acompanha o elemento (rolagem, redimensionar) e põe o foco no cartão.
    effect(() => {
      const step = this.tour.current();
      this.parar();
      this.spot.set(null);
      this.pos.set(null);
      this.line.set(null);
      if (!step) return;
      this.timer = setTimeout(() => {
        this.mostrarAlvo(step.target);
        this.acompanhar();
        this.proximo()?.nativeElement.focus({ preventScroll: true });
      }, 0);
    });
  }

  ngOnDestroy(): void {
    this.parar();
  }

  protected onKey(e: KeyboardEvent): void {
    if (!this.tour.active()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.tour.stop();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.tour.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.tour.prev();
    } else if (e.key === 'Tab') {
      // O foco fica nos botões do cartão: a página de trás está bloqueada.
      const botoes = Array.from(this.cartao()?.nativeElement.querySelectorAll('button') ?? []);
      if (botoes.length === 0) return;
      const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
      const proximo = e.shiftKey ? i - 1 : i + 1;
      if (i === -1 || proximo < 0 || proximo >= botoes.length) {
        e.preventDefault();
        botoes[e.shiftKey ? botoes.length - 1 : 0].focus();
      }
    }
  }

  private parar(): void {
    this.rodando = false;
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.timer = null;
    this.frame = null;
  }

  /** Rola a página até o alvo ficar à vista (menos o cabeçalho e a barra lateral, que já são fixos). */
  private mostrarAlvo(alvo: string): void {
    const el = findTourTarget(alvo);
    if (!el || el.closest('header, aside')) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const alto = r.height > vh - ALTURA_CABECALHO - 40;
    const visivel = r.top >= ALTURA_CABECALHO + 8 && r.bottom <= vh - 20;
    if (visivel) return;
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const top = alto
      ? r.top - ALTURA_CABECALHO - 16
      : r.top + r.height / 2 - (vh + ALTURA_CABECALHO) / 2;
    window.scrollBy({ top, behavior: reduzir ? 'auto' : 'smooth' });
  }

  /** Reposiciona destaque, cartão e linha a cada quadro enquanto o passo está na tela (acompanha a rolagem). */
  private acompanhar(): void {
    this.rodando = true;
    const quadro = () => {
      if (!this.rodando) return;
      this.medir();
      this.frame = requestAnimationFrame(quadro);
    };
    quadro();
  }

  private medir(): void {
    const step = this.tour.current();
    if (!step) return;
    const el = findTourTarget(step.target);
    if (!el) {
      this.spot.set(null);
      this.line.set(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const top = Math.max(4, r.top - FOLGA);
    const left = Math.max(4, r.left - FOLGA);
    const right = Math.min(vw - 4, r.right + FOLGA);
    const bottom = Math.min(vh - 4, r.bottom + FOLGA);
    const box: Box = {
      top,
      left,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };

    const cartao = this.cartao()?.nativeElement;
    const pw = cartao?.offsetWidth || 340;
    const ph = cartao?.offsetHeight || 180;
    const cx = left + box.width / 2;
    const cy = top + box.height / 2;
    const entre = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
    const x = (v: number) => entre(v, MARGEM, Math.max(MARGEM, vw - pw - MARGEM));
    const y = (v: number) => entre(v, MARGEM, Math.max(MARGEM, vh - ph - MARGEM));

    let pos: Pos;
    let line: Line | null = null;
    if (vh - bottom >= ph + DISTANCIA + MARGEM) {
      pos = { top: bottom + DISTANCIA, left: x(cx - pw / 2) };
      const px = entre(cx, pos.left + 20, pos.left + pw - 20);
      line = { x1: px, y1: pos.top, x2: entre(px, left + 8, right - 8), y2: bottom };
    } else if (top >= ph + DISTANCIA + MARGEM) {
      pos = { top: top - DISTANCIA - ph, left: x(cx - pw / 2) };
      const px = entre(cx, pos.left + 20, pos.left + pw - 20);
      line = { x1: px, y1: pos.top + ph, x2: entre(px, left + 8, right - 8), y2: top };
    } else if (vw - right >= pw + DISTANCIA + MARGEM) {
      pos = { top: y(cy - ph / 2), left: right + DISTANCIA };
      const py = entre(cy, pos.top + 20, pos.top + ph - 20);
      line = { x1: pos.left, y1: py, x2: right, y2: entre(py, top + 8, bottom - 8) };
    } else if (left >= pw + DISTANCIA + MARGEM) {
      pos = { top: y(cy - ph / 2), left: left - DISTANCIA - pw };
      const py = entre(cy, pos.top + 20, pos.top + ph - 20);
      line = { x1: pos.left + pw, y1: py, x2: left, y2: entre(py, top + 8, bottom - 8) };
    } else {
      // Alvo grande demais para sobrar espaço: o cartão fica embaixo, sobre ele, sem linha.
      pos = { top: vh - ph - MARGEM, left: x(cx - pw / 2) };
    }

    if (JSON.stringify(box) !== JSON.stringify(this.spot())) this.spot.set(box);
    if (JSON.stringify(pos) !== JSON.stringify(this.pos())) this.pos.set(pos);
    if (JSON.stringify(line) !== JSON.stringify(this.line())) this.line.set(line);
  }
}
