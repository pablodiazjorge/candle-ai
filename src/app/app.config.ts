import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zoneless change detection (stable in Angular 22)
    provideZonelessChangeDetection(),
    // Router with view transitions
    provideRouter(routes, withViewTransitions()),
    // HTTP client
    provideHttpClient(withFetch()),
    // ngx-translate v18 (functional providers, no NgModule)
    provideTranslateService({ fallbackLang: 'en' }),
    provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json' }),
  ],
};
