import { Component, OnInit, signal, computed, inject } from '@angular/core';
import {
  CustosService,
  Despesa,
  Subitem,
  isAnomalo,
  CANAL_DELIVERY,
} from '../../services/custos.service';
import type { PeriodKey } from '../../services/receitas.service';
import { IconComponent } from '../../shared/icon.component';
import { ChipComponent } from '../../shared/chip.component';
import { HintComponent } from '../../shared/hint.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { ChartCardComponent } from '../../shared/chart-card.component';
import { InsightCardComponent } from '../../shared/insight-card.component';
import { SectionHeaderComponent } from '../../shared/section-header.component';
import { BulletComponent } from '../../shared/bullet.component';
import { ToggleGroupComponent, ToggleGroupOption } from '../../shared/toggle-group.component';
import { LineChartComponent, LineSeries } from '../../shared/line-chart.component';
import { ToastService } from '../../shared/toast.service';
import { formatBRL } from '../../shared/format';

const PERIODS: PeriodKey[] = ['Hoje', '7 dias', 'Este mês', 'Mês passado', 'Personalizado'];
const abrev = (v: number) =>
  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));

type Compare = 'anterior' | 'media3';
type Lente = 'todos' | 'variaveis' | 'fixos';
type Canal = 'geral' | 'salao' | 'delivery';

interface LinhaDespesa extends Despesa {
  fator: number;
  valorCanal: number;
  base: number;
  geral: boolean;
  metric: number;
}

@Component({
  selector: 'app-custos',
  standalone: true,
  imports: [
    IconComponent,
    ChipComponent,
    HintComponent,
    StatCardComponent,
    ChartCardComponent,
    InsightCardComponent,
    SectionHeaderComponent,
    BulletComponent,
    ToggleGroupComponent,
    LineChartComponent,
  ],
  templateUrl: './custos.component.html',
})
export class CustosComponent implements OnInit {
  private svc = inject(CustosService);
  private toast = inject(ToastService);

  protected periods = PERIODS;
  protected period = signal<PeriodKey>('Este mês');
  protected customFrom = signal('2026-07-01');
  protected customTo = signal('2026-07-07');

  protected valueMode = signal<'brl' | 'pct'>('brl');
  protected compare = signal<Compare>('anterior');
  protected lente = signal<Lente>('todos');
  protected canal = signal<Canal>('geral');
  protected trendMode = signal<'total' | 'categoria'>('total');
  protected openCat = signal<string | null>(null);
  protected subDestaque = signal<string | null>(null);

  protected data = this.svc.data;
  protected loading = this.svc.loading;
  protected fmtBRL = formatBRL;
  protected abrev = abrev;
  protected isAnomalo = isAnomalo;

  protected compareOpts: ToggleGroupOption[] = [
    { value: 'anterior', label: 'vs. mês anterior' },
    { value: 'media3', label: 'vs. média 3 meses' },
  ];
  protected valueModeOpts: ToggleGroupOption[] = [
    { value: 'brl', label: 'R$' },
    { value: 'pct', label: '% da receita' },
  ];
  protected lenteOpts: ToggleGroupOption[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'variaveis', label: 'Só variáveis' },
    { value: 'fixos', label: 'Só fixos' },
  ];
  protected canalOpts: ToggleGroupOption[] = [
    { value: 'geral', label: 'Geral' },
    { value: 'salao', label: 'Salão' },
    { value: 'delivery', label: 'Delivery' },
  ];

  protected trendSeriesTotal: LineSeries[] = [
    { key: 'total', name: 'Total de despesas', color: 'var(--ocean)' },
  ];
  protected trendSeriesCategoria: LineSeries[] = [
    { key: 'cmv', name: 'CMV / Insumos', color: 'var(--warning)' },
    { key: 'proLabore', name: 'Pró-labore', color: 'var(--ocean)' },
    { key: 'ifood', name: 'Taxa iFood', color: 'var(--mint)' },
    { key: 'aluguel', name: 'Aluguel', color: 'var(--success)' },
    { key: 'utilidades', name: 'Utilidades', color: 'var(--error)' },
  ];

  private fatorCanal(categoria: string): number {
    const canal = this.canal();
    if (canal === 'geral') return 1;
    const share = CANAL_DELIVERY[categoria];
    if (share == null) return 1;
    return canal === 'delivery' ? share : 1 - share;
  }

  protected linhas = computed<LinhaDespesa[]>(() => {
    const d = this.data();
    if (!d) return [];
    const lente = this.lente();
    const compare = this.compare();
    const valueMode = this.valueMode();
    return d.despesas
      .filter((x) =>
        lente === 'todos' ? true : lente === 'fixos' ? x.tipo === 'Fixo' : x.tipo !== 'Fixo',
      )
      .map((x) => {
        const fator = this.fatorCanal(x.categoria);
        const valor = x.valor * fator;
        const base =
          (compare === 'anterior'
            ? x.valorAnterior
            : x.subitens.reduce((acc, s) => acc + s.mediaUlt3Meses, 0)) * fator;
        return {
          ...x,
          fator,
          valorCanal: valor,
          base,
          geral: this.canal() !== 'geral' && CANAL_DELIVERY[x.categoria] == null,
          metric: valueMode === 'brl' ? valor : (valor / d.receita) * 100,
        };
      })
      .sort((a, b) => b.valorCanal - a.valorCanal);
  });

  protected saltosLabel = computed(() =>
    (this.data()?.saltos ?? []).map((s) => `${s.label} (${s.mes})`).join(' · '),
  );

  protected maxMetric = computed(() => Math.max(...this.linhas().map((l) => l.metric), 1));
  protected totalLinhas = computed(() => this.linhas().reduce((acc, l) => acc + l.valorCanal, 0));
  protected variaveisTotal = computed(() => {
    const d = this.data();
    if (!d) return 0;
    return d.despesas.reduce(
      (acc, x) =>
        acc +
        x.subitens.filter((s) => s.tipo === 'variavel').reduce((a, s) => a + s.valorMesAtual, 0),
      0,
    );
  });
  protected variaveisPct = computed(() => {
    const d = this.data();
    if (!d || !d.total) return 0;
    return (this.variaveisTotal() / d.total) * 100;
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.openCat.set(null);
    this.subDestaque.set(null);
    this.svc
      .refresh(this.period(), this.customFrom(), this.customTo())
      .catch(() => this.toast.error('Não foi possível carregar os dados de custos.'));
  }

  setPeriod(p: PeriodKey): void {
    this.period.set(p);
    this.load();
  }

  setCustomFrom(v: string): void {
    this.customFrom.set(v);
    if (this.period() === 'Personalizado') this.load();
  }

  setCustomTo(v: string): void {
    this.customTo.set(v);
    if (this.period() === 'Personalizado') this.load();
  }

  toggleCat(categoria: string): void {
    this.openCat.set(this.openCat() === categoria ? null : categoria);
    this.subDestaque.set(null);
  }

  abrirAlerta(categoria: string, subitem: string): void {
    this.openCat.set(categoria);
    this.subDestaque.set(subitem);
    this.lente.set('todos');
    this.canal.set('geral');
    requestAnimationFrame(() =>
      document
        .getElementById('custos-onde')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  temAlerta(d: Despesa): boolean {
    return d.subitens.some(isAnomalo);
  }

  deltaOf(
    atual: number,
    base: number,
  ): { text: string; up: boolean; neutral: boolean; novo: boolean } {
    if (!base) return { text: 'novo', up: false, neutral: false, novo: true };
    const p = ((atual - base) / base) * 100;
    if (Math.abs(p) < 1) return { text: 'estável', up: false, neutral: true, novo: false };
    return { text: `${Math.abs(p).toFixed(0)}%`, up: p >= 0, neutral: false, novo: false };
  }

  subValor(sub: Subitem, fator: number): number {
    return sub.valorMesAtual * fator;
  }

  subBase(sub: Subitem, fator: number): number {
    return (this.compare() === 'anterior' ? sub.valorMesAnterior : sub.mediaUlt3Meses) * fator;
  }
}
