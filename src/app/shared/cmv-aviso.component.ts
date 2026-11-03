import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertComponent } from './alert.component';
import { formatBRL } from './format';

export interface DespesaForaDoCmv {
  name: string;
  amount: number;
}

/**
 * Aviso de CMV zerado com despesa variável fora dele. Quem usa decide quando mostrar (CMV = 0 e
 * itens não vazios); aqui só o texto e o caminho para corrigir: mudar o grupo da categoria.
 */
@Component({
  selector: 'app-cmv-aviso',
  standalone: true,
  imports: [AlertComponent, RouterLink],
  host: { class: 'block' },
  template: `
    <app-alert variant="warning" title="Seu CMV está zerado">
      Você tem despesas variáveis em despesas operacionais:
      <strong>{{ nomes }}</strong> ({{ total }}). Se forem ingredientes ou insumos, mude a categoria
      para “Ingredientes e insumos (CMV)”.
      <a routerLink="/categorias" class="font-semibold text-ocean hover:underline"
        >Ir para Categorias</a
      >
    </app-alert>
  `,
})
export class CmvAvisoComponent {
  @Input() itens: DespesaForaDoCmv[] = [];

  /** As três maiores, para a frase não ficar enorme. */
  get nomes(): string {
    const maiores = [...this.itens].sort((a, b) => b.amount - a.amount).slice(0, 3);
    const extra = this.itens.length - maiores.length;
    return maiores.map((i) => i.name).join(', ') + (extra > 0 ? ` e mais ${extra}` : '');
  }

  get total(): string {
    return formatBRL(this.itens.reduce((acc, i) => acc + i.amount, 0));
  }
}
