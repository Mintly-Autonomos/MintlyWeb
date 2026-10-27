export const environment = {
  apiUrl: 'http://localhost:3000',
  name: 'development',
  // Header `env` exigido pelos clients da mintly-lib (seleciona o "ambiente"/tenant
  // no backend); staging é a única fonte de dados usada em todo lugar.
  mintlyEnv: 'staging',
  production: false,
  enableDevTools: true,
  // Default SEMPRE false (bate no back real). Vire true só localmente (não comitar)
  // quando a MintlyApi não estiver rodando — os services então usam os JSON de
  // `src/app/mocks/` em vez do client real.
  useMocks: false,
} as const;
