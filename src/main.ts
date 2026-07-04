import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// mintly-lib monta o baseURL do axios em `process.env.BACK_END_URL` (feito para Node).
// No browser não existe `process`, então precisamos definir isso antes de qualquer
// client da lib ser instanciado (MasterClient/AuthClient/HttpBaseClient leem essa
// variável no próprio construtor).
(globalThis as unknown as { process: { env: Record<string, string> } }).process = {
  env: { BACK_END_URL: environment.apiUrl },
};

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
