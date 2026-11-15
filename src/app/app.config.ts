import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, TitleStrategy, withNavigationErrorHandler } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { AppTitleStrategy } from './app-title.strategy';
import { jwtInterceptor } from './interceptors/jwt.interceptor';
import { reloadOnceForChunkError } from './shared/chunk-reload';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),
    // Depois de um deploy, a tela pedida pode não existir mais no servidor: recarrega uma vez.
    provideRouter(
      routes,
      withNavigationErrorHandler((e) => void reloadOnceForChunkError(e.error)),
    ),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideHttpClient(withInterceptors([jwtInterceptor])),
  ],
};
