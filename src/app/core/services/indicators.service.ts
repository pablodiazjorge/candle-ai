import { Injectable, signal } from '@angular/core';
import { Candle } from '../models/candle.model';
import { IndicatorResults, IndicatorSettings } from '../models/indicator.model';
import { DEFAULT_INDICATOR_SETTINGS } from '../models/indicator.model';

// Re-export for convenience
export type { IndicatorSettings };
export { DEFAULT_INDICATOR_SETTINGS };

@Injectable({ providedIn: 'root' })
export class IndicatorsService {
  /** Whether the worker is currently computing */
  readonly computing = signal(false);

  private worker: Worker | null = null;

  /**
   * Compute indicators in a Web Worker.
   * Creates the worker lazily and reuses it.
   */
  computeIndicators(candles: Candle[], settings: IndicatorSettings): Promise<IndicatorResults> {
    return new Promise((resolve, reject) => {
      this.computing.set(true);

      try {
        if (!this.worker) {
          this.worker = new Worker(
            new URL('../workers/indicators.worker.ts', import.meta.url),
            { type: 'module' },
          );
        }

        // Set up one-time message listener for this computation
        const handler = (event: MessageEvent<IndicatorResults>) => {
          this.worker!.removeEventListener('message', handler);
          this.computing.set(false);
          resolve(event.data);
        };

        this.worker.addEventListener('message', handler);
        this.worker.addEventListener('error', (err) => {
          this.worker!.removeEventListener('message', handler);
          this.computing.set(false);
          reject(err);
        });

        this.worker.postMessage({ candles, settings });
      } catch (err) {
        this.computing.set(false);
        reject(err);
      }
    });
  }

  /** Terminate the worker (e.g., when app is destroyed) */
  destroyWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
