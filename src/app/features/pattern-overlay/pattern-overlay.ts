import { Component, input, inject, signal, computed } from '@angular/core';
import { DetectedPattern, PatternType } from '../../core/models/pattern.model';
import { TickerStore } from '../../core/state/ticker.store';
import { TranslatePipe } from '@ngx-translate/core';

/** WCAG 1.4.1 compliant: non-color text-based indicators for pattern sentiment */
const SENTIMENT_ICONS: Record<string, string> = {
  bullish: '▲',
  bearish: '▼',
  neutral: '—',
};

/** All known pattern types with their sentiment for the selection modal */
const ALL_PATTERN_META: { type: PatternType; sentiment: string; labelKey: string }[] = [
  { type: 'doji', sentiment: 'neutral', labelKey: 'pattern.doji' },
  { type: 'hammer', sentiment: 'bullish', labelKey: 'pattern.hammer' },
  { type: 'shooting_star', sentiment: 'bearish', labelKey: 'pattern.shootingStar' },
  { type: 'bullish_engulfing', sentiment: 'bullish', labelKey: 'pattern.bullishEngulfing' },
  { type: 'bearish_engulfing', sentiment: 'bearish', labelKey: 'pattern.bearishEngulfing' },
  { type: 'morning_star', sentiment: 'bullish', labelKey: 'pattern.morningStar' },
  { type: 'evening_star', sentiment: 'bearish', labelKey: 'pattern.eveningStar' },
  { type: 'bullish_harami', sentiment: 'bullish', labelKey: 'pattern.bullishHarami' },
  { type: 'bearish_harami', sentiment: 'bearish', labelKey: 'pattern.bearishHarami' },
  { type: 'three_white_soldiers', sentiment: 'bullish', labelKey: 'pattern.threeWhiteSoldiers' },
  { type: 'three_black_crows', sentiment: 'bearish', labelKey: 'pattern.threeBlackCrows' },
  { type: 'double_top', sentiment: 'bearish', labelKey: 'pattern.doubleTop' },
  { type: 'double_bottom', sentiment: 'bullish', labelKey: 'pattern.doubleBottom' },
  { type: 'head_and_shoulders', sentiment: 'bearish', labelKey: 'pattern.headAndShoulders' },
  { type: 'inverse_head_and_shoulders', sentiment: 'bullish', labelKey: 'pattern.inverseHeadAndShoulders' },
];

@Component({
  selector: 'app-pattern-overlay',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './pattern-overlay.html',
  styleUrl: './pattern-overlay.css',
})
export class PatternOverlay {
  readonly store = inject(TickerStore);
  readonly patterns = input<DetectedPattern[]>([]);
  readonly loading = input(false);

  /** Whether the pattern selection modal is open */
  readonly modalOpen = signal(false);

  /** Unique pattern types present in the current data */
  readonly availableTypes = computed(() => {
    const types = new Set(this.patterns().map((p) => p.type));
    return ALL_PATTERN_META.filter((m) => types.has(m.type));
  });

  /** How many pattern types are currently selected */
  readonly selectedCount = computed(() => this.store.visiblePatternTypes().size);

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

  openModal(): void {
    // Auto-select all available types when opening if none are selected
    if (this.store.visiblePatternTypes().size === 0) {
      const allTypes = this.availableTypes().map((m) => m.type);
      this.store.selectAllPatternTypes(allTypes);
    }
    this.modalOpen.set(true);
    // Focus the close button when modal opens (WCAG 2.4.3)
    setTimeout(() => {
      const closeBtn = document.querySelector<HTMLElement>('.modal-content .modal-close');
      closeBtn?.focus();
    });
  }

  closeModal(): void {
    this.modalOpen.set(false);
    // Return focus to the trigger button
    setTimeout(() => {
      const trigger = document.querySelector<HTMLElement>('.btn-manage-markers');
      trigger?.focus();
    });
  }

  /** Handle keyboard events in modal: Escape to close, Tab trap */
  onModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeModal();
      return;
    }
    // Focus trap within modal
    if (event.key === 'Tab') {
      const modal = document.querySelector('.modal-content');
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  toggleInModal(type: PatternType): void {
    this.store.togglePatternType(type);
  }

  selectAll(): void {
    const allTypes = this.availableTypes().map((m) => m.type);
    this.store.selectAllPatternTypes(allTypes);
  }

  deselectAll(): void {
    this.store.deselectAllPatternTypes();
  }
}
