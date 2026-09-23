import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { ButtonComponent } from '../../shared/button.component';
import { ModalComponent } from '../../shared/modal.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import { BulletComponent } from '../../shared/bullet.component';
import { WaterfallChartComponent } from '../../shared/waterfall-chart.component';
import { AreaChartComponent, AreaSeries } from '../../shared/area-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL } from '../../shared/format';

const PERIODS = ['Hoje', '7 dias', 'Este mês', 'Mês passado', 'Personalizado'];
const abrev = (v: number) => `${Math.round(v / 1000)}k`;

const SCORE_META: Record<'risco' | 'atencao' | 'saudavel', { color: string; label: string }> = {
  risco: { color: 'var(--error)', label: 'Em risco' },
  atencao: { color: 'var(--warning)', label: 'Atenção' },
  saudavel: { color: 'var(--success)', label: 'Saudável' },
};

@Component({
  selector: 'app-visao-geral',
  standalone: true,
  imports: [
    IconComponent,
    ChipComponent,
    HintComponent,
    ButtonComponent,
    ModalComponent,
    StatCardComponent,
    ChartCardComponent,
    InsightCardComponent,
    SectionHeaderComponent,
    BulletComponent,
    WaterfallChartComponent,
    AreaChartComponent,
  ],
  templateUrl: './visao-geral.component.html',
})
export class VisaoGeralComponent implements OnInit {
  private svc = inject(DashboardService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected periods = PERIODS;
  protected period = signal('Este mês');
  protected scoreOpen = signal(false);

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected abrev = abrev;
  protected readonly circumference = 2 * Math.PI * 46;

  protected scoreMeta = computed(() => SCORE_META[this.data()?.saude.level ?? 'atencao']);

  protected scoreDashoffset = computed(() => {
    const score = this.data()?.saude.score ?? 0;
    return this.circumference * (1 - score / 100);
  });

  protected scoreResumo = computed(() => {
    const saude = this.data()?.saude;
    if (!saude) return '';
    const ordenados = [...saude.pilares].sort((a, b) => b.score - a.score);
    const fortes = ordenados.filter((p) => p.score >= 75).slice(0, 2);
    const fraco = ordenados[ordenados.length - 1];
    const nome = (l: string) => l.toLowerCase();
    const bons =
      fortes.length >= 2
        ? `${nome(fortes[0].label)} e ${nome(fortes[1].label)} estão bem`
        : fortes.length === 1
          ? `${nome(fortes[0].label)} está bem`
          : 'vários pontos precisam de atenção';
    return `Sua ${bons}. Fique de olho em ${nome(fraco.label)}.`;
  });

  protected mainData = computed(() => {
    const d = this.data();
    if (!d) return [];
    const rows = d.monthlyHistory.map((m) => ({
      ...m,
      lucroProj: null as number | null,
      receitaProj: null as number | null,
      despesaProj: null as number | null,
    }));
    const last = rows[rows.length - 1];
    last.receitaProj = last.receita;
    last.despesaProj = last.despesa;
    rows.push({
      month: 'Ago (proj.)',
      receita: null as unknown as number,
      despesa: null as unknown as number,
      lucro: null as unknown as number,
      lucroProj: 4300,
      receitaProj: 57200,
      despesaProj: 52900,
    });
    return rows;
  });

  protected mainSeries: AreaSeries[] = [
    { key: 'receita', name: 'Receita', color: 'var(--ocean)' },
    { key: 'receitaProj', name: 'Receita (projeção)', color: 'var(--ocean)', dashed: true },
    { key: 'despesa', name: 'Despesa', color: 'var(--warning)' },
    { key: 'despesaProj', name: 'Despesa (projeção)', color: 'var(--warning)', dashed: true },
  ];

  ngOnInit(): void {
    this.svc.refresh().catch(() => this.toast.error('Não foi possível carregar a visão geral.'));
  }

  setPeriod(p: string): void {
    this.period.set(p);
  }

  actionRoute(action: string | undefined): string {
    switch (action) {
      case 'Ver custos':
        return '/custos';
      case 'Ver fluxo de caixa':
        return '/fluxo-de-caixa';
      case 'Ver cardápio':
        return '/previsoes';
      default:
        return '/';
    }
  }

  goTo(path: string): void {
    this.router.navigate([path]);
  }
}
