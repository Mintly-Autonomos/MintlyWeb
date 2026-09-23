import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  // Auth routes (wrapped in AuthShell)
  {
    path: 'auth',
    loadComponent: () => import('./layout/auth-shell.component').then((m) => m.AuthShellComponent),
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./pages/auth/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'cadastro',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./pages/auth/cadastro.component').then((m) => m.CadastroComponent),
      },
      {
        path: 'sessao-expirada',
        loadComponent: () =>
          import('./pages/auth/sessao-expirada.component').then((m) => m.SessaoExpiradaComponent),
      },
      {
        path: 'esqueci-senha',
        loadComponent: () =>
          import('./pages/auth/esqueci-senha.component').then((m) => m.EsqueciSenhaComponent),
      },
      {
        path: 'redefinir-senha',
        loadComponent: () =>
          import('./pages/auth/redefinir-senha.component').then((m) => m.RedefinirSenhaComponent),
      },
      {
        path: 'token-invalido',
        loadComponent: () =>
          import('./pages/auth/token-invalido.component').then((m) => m.TokenInvalidoComponent),
      },
      {
        path: 'bloqueado',
        loadComponent: () =>
          import('./pages/auth/bloqueado.component').then((m) => m.BloqueadoComponent),
      },
      {
        path: 'logout',
        loadComponent: () => import('./pages/auth/logout.component').then((m) => m.LogoutComponent),
      },
      {
        path: 'onboarding',
        loadComponent: () =>
          import('./pages/auth/onboarding.component').then((m) => m.OnboardingComponent),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
  // Dev showcase (navbar/popup/dev-test + Material) — preserva o trabalho anterior da staging
  {
    path: 'dev',
    loadComponent: () => import('./pages/dev/dev-home.component').then((m) => m.DevHomeComponent),
  },
  // App routes (wrapped in AppLayout — protegidas por authGuard)
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-layout.component').then((m) => m.AppLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/contas/contas.component').then((m) => m.ContasComponent),
      },
      {
        path: 'movimentacoes',
        loadComponent: () =>
          import('./pages/movimentacoes/movimentacoes.component').then(
            (m) => m.MovimentacoesComponent,
          ),
      },
      {
        path: 'categorias',
        loadComponent: () =>
          import('./pages/categorias/categorias.component').then((m) => m.CategoriasComponent),
      },
      {
        path: 'receitas',
        loadComponent: () =>
          import('./pages/receitas/receitas.component').then((m) => m.ReceitasComponent),
      },
      {
        path: 'custos',
        loadComponent: () =>
          import('./pages/custos/custos.component').then((m) => m.CustosComponent),
      },
      {
        path: 'fluxo-de-caixa',
        loadComponent: () =>
          import('./pages/fluxo-caixa/fluxo-caixa.component').then((m) => m.FluxoCaixaComponent),
      },
      {
        path: 'resultado',
        loadComponent: () =>
          import('./pages/resultado/resultado.component').then((m) => m.ResultadoComponent),
      },
      {
        path: 'previsoes',
        loadComponent: () =>
          import('./pages/previsoes/previsoes.component').then((m) => m.PrevisoesComponent),
      },
      {
        path: 'visao-geral',
        loadComponent: () =>
          import('./pages/visao-geral/visao-geral.component').then((m) => m.VisaoGeralComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
