import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CashFlowReport } from 'mintly-lib';
import { FluxoCaixaService } from '../../services/fluxo-caixa.service';
import { IconComponent } from '../../shared/icon.component';
import { HintComponent } from '../../shared/hint.component';
import { formatBRL } from '../../shared/format';

/** Próximos dias que o card olha (P.8). */
export const DIAS_ESTOU_DEVENDO = 7;

export type SituacaoDivida = 'vencido' | 'apertado' | 'tranquilo';

/** Os números do card, a partir do Fluxo de caixa com horizonte de 7 dias. Pura (testada sem tela). */
export function resumoDivida(r: Pick<CashFlowReport, 'cashToday' | 'payable' | 'overdue'>): {
  vencido: number;
  vencidosQtd: number;
  proximos: number;
  caixaHoje: number;
  livre: number;
  situacao: SituacaoDivida;
} {
  const vencido = Math.max(0, r.overdue.payable);
  // `payable` já inclui o vencido: o que vence nos próximos dias é o resto.
  const proximos = Math.max(0, r.payable - vencido);
  const livre = Math.round((r.cashToday - vencido - proximos) * 100) / 100;
  const situacao: SituacaoDivida = vencido > 0 ? 'vencido' : livre < 0 ? 'apertado' : 'tranquilo';
  return {
    vencido,
    vencidosQtd: vencido > 0 ? r.overdue.count : 0,
    proximos,
    caixaHoje: r.cashToday,
    livre,
    situacao,
  };
}

/**
 * Card "Estou devendo?" da Visão geral (relatório Sweetie Bel, P.8): responde de cara se há conta vencida, quanto
 * vence nos próximos 7 dias e quanto do caixa sobra depois de pagar tudo isso. Vale para hoje, qualquer que seja
 * o mês escolhido na tela.
 */
@Component({
  selector: 'app-estou-devendo',
  standalone: true,
  imports: [RouterLink, IconComponent, HintComponent],
  template: `
    <section
      class="m3-card rounded-2xl p-5"
      data-testid="estou-devendo"
      aria-labelledby="estou-devendo-titulo"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h3
            id="estou-devendo-titulo"
            class="text-[15px] font-bold tracking-tight inline-flex items-center gap-1.5"
          >
            Estou devendo?
            <app-hint
              text="Vencido: contas a pagar com vencimento até ontem e ainda não pagas. Próximos 7 dias: contas a pagar que vencem de hoje até daqui a 7 dias. Caixa livre = saldo das contas hoje − vencido − próximos 7 dias. O que você tem a receber não entra: é o que sobra só com o dinheiro que já está em caixa."
            />
          </h3>
          <p class="text-[12.5px] text-muted-foreground mt-0.5">Hoje, com o que já está em caixa</p>
        </div>
        <a
          routerLink="/fluxo-de-caixa"
          class="text-[12.5px] font-semibold text-ocean hover:underline underline-offset-2"
          data-testid="estou-devendo-fluxo"
          >Ver no Fluxo de caixa</a
        >
      </div>

      @if (carregando()) {
        <div class="mt-4 h-20 rounded-xl bg-muted animate-pulse"></div>
      } @else if (erro()) {
        <p class="mt-4 text-[13px] text-muted-foreground" data-testid="estou-devendo-erro">
          Não deu para consultar as contas agora. Veja direto no Fluxo de caixa.
        </p>
      } @else if (resumo(); as r) {
        <div
          [class]="
            'mt-4 flex items-start gap-3 rounded-xl px-4 py-3 ' +
            (r.situacao === 'vencido'
              ? 'bg-error/10'
              : r.situacao === 'apertado'
                ? 'bg-warning/10'
                : 'bg-success/10')
          "
          data-testid="estou-devendo-resposta"
        >
          <app-icon
            [name]="
              r.situacao === 'vencido'
                ? 'error'
                : r.situacao === 'apertado'
                  ? 'warning'
                  : 'check_circle'
            "
            [className]="
              'shrink-0 mt-0.5 ' +
              (r.situacao === 'vencido'
                ? 'text-error'
                : r.situacao === 'apertado'
                  ? 'text-warning'
                  : 'text-success')
            "
            [style]="{ fontSize: '20px' }"
          />
          <p class="text-[13.5px] font-semibold leading-snug">{{ frase() }}</p>
        </div>

        <dl class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-xl border border-border p-3" data-testid="estou-devendo-vencido">
            <dt class="text-[12px] text-muted-foreground">Vencido</dt>
            <dd
              [class]="
                'text-[18px] font-bold tabular-nums mt-0.5 ' + (r.vencido > 0 ? 'text-error' : '')
              "
            >
              {{ brl(r.vencido) }}
            </dd>
            <dd class="text-[11.5px] text-muted-foreground">
              {{
                r.vencidosQtd > 0
                  ? r.vencidosQtd + (r.vencidosQtd === 1 ? ' conta' : ' contas')
                  : 'Nada em atraso'
              }}
            </dd>
          </div>
          <div class="rounded-xl border border-border p-3" data-testid="estou-devendo-proximos">
            <dt class="text-[12px] text-muted-foreground">Vence em {{ dias }} dias</dt>
            <dd class="text-[18px] font-bold tabular-nums mt-0.5">{{ brl(r.proximos) }}</dd>
            <dd class="text-[11.5px] text-muted-foreground">Contas a pagar de hoje em diante</dd>
          </div>
          <div class="rounded-xl border border-border p-3" data-testid="estou-devendo-livre">
            <dt class="text-[12px] text-muted-foreground">Caixa livre</dt>
            <dd
              [class]="
                'text-[18px] font-bold tabular-nums mt-0.5 ' +
                (r.livre < 0 ? 'text-error' : 'text-success')
              "
            >
              {{ brl(r.livre) }}
            </dd>
            <dd class="text-[11.5px] text-muted-foreground">
              De {{ brl(r.caixaHoje) }} em caixa hoje
            </dd>
          </div>
        </dl>
      }
    </section>
  `,
})
export class EstouDevendoComponent implements OnInit {
  private fluxo = inject(FluxoCaixaService);
  protected readonly dias = DIAS_ESTOU_DEVENDO;
  protected readonly brl = formatBRL;
  protected carregando = signal(true);
  protected erro = signal(false);
  private relatorio = signal<CashFlowReport | null>(null);

  protected resumo = computed(() => {
    const r = this.relatorio();
    return r ? resumoDivida(r) : null;
  });

  protected frase = computed(() => {
    const r = this.resumo();
    if (!r) return '';
    if (r.situacao === 'vencido') {
      return `Sim: ${this.brl(r.vencido)} em contas vencidas. Pague essas primeiro.`;
    }
    if (r.situacao === 'apertado') {
      return `Nada vencido, mas o caixa de hoje não cobre o que vence em ${this.dias} dias: faltam ${this.brl(-r.livre)}.`;
    }
    return r.proximos > 0
      ? `Não. Depois de pagar o que vence em ${this.dias} dias, sobram ${this.brl(r.livre)} em caixa.`
      : `Não. Nada vencido e nada a pagar nos próximos ${this.dias} dias.`;
  });

  async ngOnInit(): Promise<void> {
    try {
      this.relatorio.set(await this.fluxo.fetchReport(DIAS_ESTOU_DEVENDO));
    } catch {
      this.erro.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
