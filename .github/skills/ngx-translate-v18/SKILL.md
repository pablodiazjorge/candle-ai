---
name: ngx-translate-v18
description: |
  API reference for @ngx-translate v18.x in Angular 18+. Use when setting up i18n,
  translating text, configuring translation services, or fixing ngx-translate
  errors. Covers v18 breaking changes: functional providers, loader inside config,
  currentLang as Signal, TranslateDirective, and TranslateBlockDirective.
  Sources: ngx-translate.org, github.com/ngx-translate/core.
license: MIT
metadata:
  author: pablodiazjorge
  url: https://github.com/pablodiazjorge/prompt-forge
  version: "1.3"
  tokens: "1.1k"
  sources: "ngx-translate.org/getting-started/installation, github.com/ngx-translate/core"
---

# @ngx-translate v18

API reference for the Angular i18n library. Covers the v18 migration from
`NgModule`-based configuration to functional providers, the new Signal-based
`currentLang`, and the loader placement requirement.

## Golden Rules

1. **No `TranslateModule.forRoot()`** — use `provideTranslateService()` functional provider
2. **Loader goes INSIDE the config** — `provideTranslateService({ loader: provideTranslateHttpLoader({...}) })`; as a separate provider it's silently ignored
3. **`currentLang` is a Signal** — call `.currentLang()` not `.currentLang`
4. **`TranslateService` is injectable directly** — no `ITranslateService` interface needed

## Critical v18 Changes

| v15- (old) | v18 (new) |
|------------|-----------|
| `TranslateModule.forRoot({...})` | `provideTranslateService({...})` |
| `TranslateHttpLoader(HttpClient, prefix, suffix)` | `provideTranslateHttpLoader({...})` inside config |
| `setDefaultLang('en')` | `fallbackLang: 'en'` in config |
| `currentLang` (string) | `currentLang()` (Signal getter) |
| `ITranslateService` | `TranslateService` (inject directly) |

## Setup

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: '/assets/i18n/',
        suffix: '.json'
      }),
      fallbackLang: 'en',
      lang: 'en'
    })
  ]
};
```

> ⚠️ **Critical**: `provideTranslateHttpLoader` must be placed **inside**
> `provideTranslateService({ loader: ... })`. If added as a separate provider
> in the providers array, `TranslateService` silently ignores it and falls back
> to its default (non-functional) loader.

## Translation Files

JSON files served from the path resolved by `prefix + lang + suffix`. Nested
keys use dot notation: `USER.LIST`.

`public/i18n/en.json`:
```json
{
  "APP_TITLE": "My App",
  "USER": { "LIST": "Users", "CREATE": "Create User" },
  "COMMON": { "SAVE": "Save", "CANCEL": "Cancel" }
}
```

`public/i18n/es.json`:
```json
{
  "APP_TITLE": "Mi App",
  "USER": { "LIST": "Usuarios", "CREATE": "Crear Usuario" },
  "COMMON": { "SAVE": "Guardar", "CANCEL": "Cancelar" }
}
```

## Usage

### Template (Pipe)

```angular-html
<h1>{{ 'APP_TITLE' | translate }}</h1>
<p>{{ 'USER.LIST' | translate }}</p>
```

Imports needed in the standalone component:
`TranslatePipe` from `@ngx-translate/core`.

v18 also provides `TranslateDirective` (attribute-based) and
`TranslateBlockDirective` (`*translateBlock` structural directive).

### Component Class

```typescript
import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({ /* ... */ })
export class MyComponent {
  private translate = inject(TranslateService);

  switchLang(lang: string): void {
    this.translate.use(lang);
    console.log(this.translate.currentLang()); // Signal getter → 'es'
  }

  init(): void {
    this.translate.addLangs(['en', 'es', 'de']);
    const text = this.translate.instant('USER.LIST'); // Synchronous
  }
}
```

### Language Switcher

```typescript
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-lang-switcher',
  standalone: true,
  imports: [FormsModule],
  template: `
    <select
      [ngModel]="translate.currentLang()"
      (ngModelChange)="translate.use($event)">
      <option value="en">EN</option>
      <option value="es">ES</option>
    </select>
  `
})
export class LangSwitcherComponent {
  translate = inject(TranslateService);
}
```

## Quick Reference

| Task | Code |
|------|------|
| Setup | `provideTranslateService({ loader: ..., fallbackLang: 'en' })` |
| Translate in template | `{{ 'KEY' \| translate }}` |
| Switch language | `translate.use('es')` |
| Get current lang | `translate.currentLang()` (Signal) |
| Sync translation | `translate.instant('KEY')` |
| Async translation | `translate.get('KEY').subscribe(v => ...)` |
| Register langs | `translate.addLangs(['en', 'es'])` |
| Stream changes | `translate.onLangChange.subscribe(e => ...)` |

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| `TranslateModule` not found | Use `provideTranslateService()` — no `NgModule` in v18 |
| `currentLang` is not a function | It's a Signal: call `.currentLang()` |
| Loader silently ignored | `provideTranslateHttpLoader` must be INSIDE `provideTranslateService({ loader: ... })` |
| Translations not loading | Verify path: `prefix` + lang + `suffix` = `/assets/i18n/en.json` |
| `setDefaultLang` not found | Use `fallbackLang` in `provideTranslateService()` config |
| `ITranslateService` not found | Inject `TranslateService` directly, no interface needed |
