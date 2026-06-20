import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { TickerSelector } from './features/ticker-selector/ticker-selector';
import { CandleChart } from './features/candle-chart/candle-chart';
import { LlmSettings } from './features/llm-settings/llm-settings';
import { LlmSettingsStore } from './core/state/llm-settings.store';
import { TickerStore } from './core/state/ticker.store';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TickerSelector, CandleChart, LlmSettings, TranslatePipe, CurrencyPipe, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly translate = inject(TranslateService);
  readonly store = inject(TickerStore);

  readonly timeframes = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
  isSidebarOpen = true;

  ngOnInit(): void {
    // i18n setup
    this.translate.addLangs(['en', 'es']);

    // Detect browser language
    const browserLang = navigator.language.split('-')[0];
    const lang = this.translate.getLangs().includes(browserLang) ? browserLang : 'en';
    this.translate.use(lang);

    // Load persisted watchlist
    this.store.loadWatchlist();
  }

  switchLanguage(lang: string): void {
    this.translate.use(lang);
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  get currentLang(): string {
    return this.translate.currentLang() ?? 'en';
  }
}
