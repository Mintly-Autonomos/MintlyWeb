import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';
import { subscriptionGuard } from './guards/subscription.guard';

export const routes: Routes = [
  // Auth routes (wrapped in AuthShell)
  {
    path: 'auth',
    loadComponent: () => import('./layout/auth-shell.component').then((m) => m.AuthShellComponent),
    children: [
      {
        path: 'login',
        title: 'Entrar',
        canActivate: [guestGuard],
        loadComponent: () => import('./pages/auth/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'cadastro',
        title: 'Criar conta',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./pages/auth/cadastro.component').then((m) => m.CadastroComponent),
      },
      {
        path: 'sessao-expirada',
        title: 'Sessão expirada',
        loadComponent: () =>
          import('./pages/auth/sessao-expirada.component').then((m) => m.SessaoExpiradaComponent),
      },
      {
        path: 'esqueci-senha',
        title: 'Recuperar senha',
        loadComponent: () =>
          import('./pages/auth/esqueci-senha.component').then((m) => m.EsqueciSenhaComponent),
      },
      {
        path: 'redefinir-senha',
        title: 'Redefinir senha',
        loadComponent: () =>
          import('./pages/auth/redefinir-senha.component').then((m) => m.RedefinirSenhaComponent),
      },
      {
        path: 'token-invalido',
        title: 'Link expirado',
        loadComponent: () =>
          import('./pages/auth/token-invalido.component').then((m) => m.TokenInvalidoComponent),
      },
      {
        path: 'bloqueado',
        title: 'Acesso bloqueado',
        loadComponent: () =>
          import('./pages/auth/bloqueado.component').then((m) => m.BloqueadoComponent),
      },
      {
        path: 'logout',
        title: 'Sessão encerrada',
        loadComponent: () => import('./pages/auth/logout.component').then((m) => m.LogoutComponent),
      },
      {
        path: 'onboarding',
        title: 'Preparando sua conta',
        // Precisa da sessão E da assinatura: confere a conta e as categorias criadas no cadastro.
        canActivate: [authGuard, subscriptionGuard],
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
  // Assinatura: exige login, mas NÃO a assinatura (é por aqui que quem não tem assina).
  {
    path: 'assinatura',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/auth-shell.component').then((m) => m.AuthShellComponent),
    children: [
      {
        path: '',
        title: 'Assinatura',
        loadComponent: () =>
          import('./pages/assinatura/assinatura.component').then((m) => m.AssinaturaComponent),
      },
      {
        path: 'retorno',
        title: 'Confirmando pagamento',
        loadComponent: () =>
          import('./pages/assinatura/assinatura-retorno.component').then(
            (m) => m.AssinaturaRetornoComponent,
          ),
      },
      {
        path: 'simulador',
        title: 'Pagamento de teste',
        loadComponent: () =>
          import('./pages/assinatura/assinatura-simulador.component').then(
            (m) => m.AssinaturaSimuladorComponent,
          ),
      },
    ],
  },
  // App routes (wrapped in AppLayout — protegidas por authGuard e pela assinatura válida)
  {
    path: '',
    canActivate: [authGuard, subscriptionGuard],
    loadComponent: () => import('./layout/app-layout.component').then((m) => m.AppLayoutComponent),
    children: [
      { path: '', redirectTo: 'visao-geral', pathMatch: 'full' },
      {
        path: 'contas',
        title: 'Contas financeiras',
        loadComponent: () =>
          import('./pages/contas/contas.component').then((m) => m.ContasComponent),
      },
      {
        path: 'movimentacoes',
        title: 'Movimentações',
        loadComponent: () =>
          import('./pages/movimentacoes/movimentacoes.component').then(
            (m) => m.MovimentacoesComponent,
          ),
      },
      {
        path: 'categorias',
        title: 'Categorias',
        loadComponent: () =>
          import('./pages/categorias/categorias.component').then((m) => m.CategoriasComponent),
      },
      {
        path: 'receitas',
        title: 'Receitas',
        loadComponent: () =>
          import('./pages/receitas/receitas.component').then((m) => m.ReceitasComponent),
      },
      {
        path: 'custos',
        title: 'Custos e despesas',
        loadComponent: () =>
          import('./pages/custos/custos.component').then((m) => m.CustosComponent),
      },
      {
        path: 'fluxo-de-caixa',
        title: 'Fluxo de caixa',
        loadComponent: () =>
          import('./pages/fluxo-caixa/fluxo-caixa.component').then((m) => m.FluxoCaixaComponent),
      },
      {
        path: 'resultado',
        title: 'Resultado',
        loadComponent: () =>
          import('./pages/resultado/resultado.component').then((m) => m.ResultadoComponent),
      },
      {
        path: 'previsoes',
        title: 'Previsões',
        loadComponent: () =>
          import('./pages/previsoes/previsoes.component').then((m) => m.PrevisoesComponent),
      },
      {
        path: 'visao-geral',
        title: 'Visão geral',
        loadComponent: () =>
          import('./pages/visao-geral/visao-geral.component').then((m) => m.VisaoGeralComponent),
      },
    ],
  },
  {
    path: '**',
    title: 'Página não encontrada',
    loadComponent: () => import('./pages/not-found.component').then((m) => m.NotFoundComponent),
  },
];
