export const environment = {
  apiUrl: 'http://localhost:3000',
  name: 'development',
  // Header `env` exigido pelos clients da mintly-lib (seleciona o "ambiente" no
  // backend; a API usa 'default' quando ausente, então mantemos o mesmo valor).
  mintlyEnv: 'default',
  production: false,
  enableDevTools: true,
} as const;
