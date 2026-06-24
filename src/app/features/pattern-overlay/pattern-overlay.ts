import { Component, input } from '@angular/core';
import { DetectedPattern } from '../../core/models/pattern.model';
import { TranslatePipe } from '@ngx-translate/core';

const SENTIMENT_ICONS: Record<string, string> = {
  bullish: '🟢',
  bearish: '🔴',
  neutral: '🟡',
};

@Component({
  selector: 'app-pattern-overlay',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './pattern-overlay.html',
  styleUrl: './pattern-overlay.css',
})
export class PatternOverlay {
  readonly patterns = input<DetectedPattern[]>([]);
  readonly loading = input(false);

  /** Patterns grouped by sentiment for display */
  get bullishPatterns(): DetectedPattern[] {
    return this.patterns().filter((p) => p.sentiment === 'bullish');
  }

  get bearishPatterns(): DetectedPattern[] {
    return this.patterns().filter((p) => p.sentiment === 'bearish');
  }

  get neutralPatterns(): DetectedPattern[] {
    return this.patterns().filter((p) => p.sentiment === 'neutral');
  }

  sentimentIcon(sentiment: string): string {
    return SENTIMENT_ICONS[sentiment] ?? '⚪';
  }

  formatConfidence(confidence: number): string {
    return Math.round(confidence * 100) + '%';
  }
}
