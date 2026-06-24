import { Component, inject, output } from '@angular/core';
import { TickerStore } from '../../core/state/ticker.store';
import { TranslatePipe } from '@ngx-translate/core';
import { IndicatorSettings } from '../../core/models/indicator.model';

interface IndicatorToggle {
  key: keyof IndicatorSettings;
  label: string;
  description: string;
}

@Component({
  selector: 'app-indicator-panel',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './indicator-panel.html',
  styleUrl: './indicator-panel.css',
})
export class IndicatorPanel {
  readonly store = inject(TickerStore);

  /** Emits when any toggle changes — parent can recompute */
  readonly indicatorsChanged = output<IndicatorSettings>();

  readonly toggles: IndicatorToggle[] = [
    { key: 'rsi', label: 'indicator.rsi', description: 'indicator.rsiDesc' },
    { key: 'macd', label: 'indicator.macd', description: 'indicator.macdDesc' },
    { key: 'bb', label: 'indicator.bb', description: 'indicator.bbDesc' },
    { key: 'sma20', label: 'indicator.sma20', description: 'indicator.sma20Desc' },
    { key: 'sma50', label: 'indicator.sma50', description: 'indicator.sma50Desc' },
    { key: 'sma200', label: 'indicator.sma200', description: 'indicator.sma200Desc' },
    { key: 'ema9', label: 'indicator.ema9', description: 'indicator.ema9Desc' },
    { key: 'ema21', label: 'indicator.ema21', description: 'indicator.ema21Desc' },
    { key: 'volumeProfile', label: 'indicator.volumeProfile', description: 'indicator.volumeProfileDesc' },
  ];

  toggle(key: keyof IndicatorSettings): void {
    this.store.toggleIndicator(key);
    this.indicatorsChanged.emit(this.store.activeIndicators());
  }

  /** Check if any indicator is active */
  get hasActiveIndicators(): boolean {
    return Object.values(this.store.activeIndicators()).some(Boolean);
  }

  /** Disable all indicators */
  disableAll(): void {
    const cleared: IndicatorSettings = {
      rsi: false, macd: false, bb: false,
      sma20: false, sma50: false, sma200: false,
      ema9: false, ema21: false, volumeProfile: false,
    };
    this.store.setActiveIndicators(cleared);
    this.indicatorsChanged.emit(cleared);
  }
}
