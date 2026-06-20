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
  | 'three_black_crows';

export type PatternSentiment = 'bullish' | 'bearish' | 'neutral';

export interface DetectedPattern {
  type: PatternType;
  /** Timestamp of the candle where the pattern completes */
  time: number;
  sentiment: PatternSentiment;
  /** Confidence 0-1 */
  confidence: number;
  /** Human-readable label (i18n key) */
  labelKey: string;
}
