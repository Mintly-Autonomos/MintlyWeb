import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { ResultadoService, DespesaOperacional } from '../../services/resultado.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { ButtonComponent } from '../../shared/button.component';
import { ModalComponent } from '../../shared/modal.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import { WaterfallChartComponent } from '../../shared/waterfall-chart.component';
import { BarChartComponent, BarSeries } from '../../shared/bar-chart.component';
import { LineChartComponent, LineSeries } from '../../shared/line-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL } from '../../shared/format';

const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const abrev = (v: number) => `${Math.round(v / 1000)}k`;

interface DeltaInfo {
  novo: boolean;
  estavel: boolean;
  bom: boolean;
  subiu: boolean;
  text: string;
}

@Component({
  selector: 'app-resultado',
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
    WaterfallChartComponent,
    BarChartComponent,
    LineChartComponent,
  ],
  templateUrl: './resultado.component.html',
})
export class ResultadoComponent implements OnInit {
  private svc = inject(ResultadoService);
  private toast = inject(ToastService);

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected pctFmt = pctFmt;
  protected abrev = abrev;
  protected readonly Math = Math;

  protected unidade = signal<'reais' | 'pct'>('reais');
  protected serie = signal<'lucro' | 'margem'>('lucro');
  protected dreOpen = signal(false);

  protected despesasOrdenadas = computed<DespesaOperacional[]>(() =>
    [...(this.data()?.despesasDetalhe ?? [])].sort((a, b) => b.valor - a.valor),
  );
  protected maiorDespesa = computed(() => this.despesasOrdenadas()[0]);

  protected lucroSeries: BarSeries[] = [{ key: 'lucro', name: 'Lucro', color: 'var(--mint)' }];
  protected margemSeries: LineSeries[] = [{ key: 'margem', name: 'Margem', color: 'var(--ocean)' }];

  protected deltaLucro = computed(() => {
    const d = this.data();
    if (!d) return 0;
    return ((d.lucroLiquido - d.anterior.lucroLiquido) / d.anterior.lucroLiquido) * 100;
  });

  ngOnInit(): void {
    this.svc
      .refresh()
      .catch(() => this.toast.error('Não foi possível carregar o resultado do mês.'));
  }

  delta(atual: number, ant: number, inverso = false): DeltaInfo {
    if (!ant) return { novo: true, estavel: false, bom: false, subiu: false, text: '' };
    const diff = ((Math.abs(atual) - Math.abs(ant)) / Math.abs(ant)) * 100;
    const subiu = diff > 0;
    const bom = inverso ? !subiu : subiu;
    if (Math.abs(diff) < 0.05) return { novo: false, estavel: true, bom, subiu, text: '' };
    return {
      novo: false,
      estavel: false,
      bom,
      subiu,
      text: `${Math.abs(diff).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
    };
  }

  despesaShare(d: DespesaOperacional): number {
    const total = this.data()?.despesasOperacionais || 1;
    return (d.valor / total) * 100;
  }

  breakEvenPct(): number {
    const d = this.data();
    if (!d) return 0;
    return Math.min(100, (d.pontoEquilibrio / d.receitaBruta) * 100);
  }
}
