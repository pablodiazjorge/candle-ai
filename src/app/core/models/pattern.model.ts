/** Detected candlestick pattern */

export type PatternType =
  | 'doji'
  | 'hammer'
  | 'shooting_star'
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'morning_star'
  | 'evening_star'
  | 'bullish_harami'
  | 'bearish_harami'
  | 'three_white_soldiers'
  | 'three_black_crows'
  | 'double_top'
  | 'double_bottom'
  | 'head_and_shoulders'
  | 'inverse_head_and_shoulders';

export type PatternGrade = 'A' | 'B' | 'C' | 'D';

export type PatternSentiment = 'bullish' | 'bearish' | 'neutral';

export interface DetectedPattern {
  type: PatternType;
  /** Timestamp of the candle where the pattern completes */
  time: number;
  sentiment: PatternSentiment;
  /** Confidence 0-1 */
  confidence: number;
  /** Quality grade A (highest) through D (lowest) */
  grade?: PatternGrade;
  /** Human-readable label (i18n key) */
  labelKey: string;
}

/** Smart Money Concept signal detected from market structure */
export interface SMCSignal {
  type: 'BOS' | 'CHoCH' | 'LIQUIDITY_SWEEP';
  direction: 'bullish' | 'bearish';
  /** Signal strength 0-1 */
  strength: number;
  /** Price level of the swing point being broken/swept */
  price: number;
  /** Human-readable description for UI */
  description: string;
}
