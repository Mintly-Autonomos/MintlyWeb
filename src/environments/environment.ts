export const environment = {
  apiUrl: 'http://localhost:3000',
  name: 'development',
  // Header `env` exigido pelos clients da mintly-lib (seleciona o "ambiente"/tenant
  // no backend); staging é a única fonte de dados usada em todo lugar.
  mintlyEnv: 'staging',
  production: false,
  enableDevTools: true,
} as const;
