/** Indicator calculation results mapped to candle timestamps */

/** Active indicator toggle settings */
export interface IndicatorSettings {
  rsi: boolean;
  macd: boolean;
  bb: boolean;
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
  ema9: boolean;
  ema21: boolean;
  volumeProfile: boolean;
  adx: boolean;
  volumeClimax: boolean;
  volumeDryUp: boolean;
  volumeDivergence: boolean;
}

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
  rsi: false,
  macd: false,
  bb: false,
  sma20: false,
  sma50: false,
  sma200: false,
  ema9: false,
  ema21: false,
  volumeProfile: false,
  adx: false,
  volumeClimax: false,
  volumeDryUp: false,
  volumeDivergence: false,
};

export interface RsiResult {
  /** Map of timestamp → RSI value */
  values: Record<number, number>;
  period: number;
}

export interface MacdResult {
  /** Map of timestamp → { macd, signal, histogram } */
  values: Record<number, { macd: number; signal: number; histogram: number }>;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export interface BollingerBandsResult {
  /** Map of timestamp → { upper, middle, lower } */
  values: Record<number, { upper: number; middle: number; lower: number }>;
  period: number;
  stdDev: number;
}

export interface SmaResult {
  values: Record<number, number>;
  period: number;
}

export interface EmaResult {
  values: Record<number, number>;
  period: number;
}

export interface VolumeProfileResult {
  /** Price levels → total volume */
  levels: { price: number; volume: number }[];
  poc: number; // Point of Control
  valueAreaHigh: number;
  valueAreaLow: number;
}

export interface AdxResult {
  /** Map of timestamp → ADX value */
  values: Record<number, number>;
  period: number;
}

export interface AtrResult {
  /** Map of timestamp → ATR value */
  values: Record<number, number>;
  period: number;
}

export type MarketRegime =
  | 'strong_uptrend'
  | 'weak_uptrend'
  | 'ranging'
  | 'weak_downtrend'
  | 'strong_downtrend'
  | 'transitional';

export interface RegimeResult {
  regime: MarketRegime;
  /** Three-method consensus confidence (0-1) */
  confidence: number;
  methods: {
    smaAlignment: string;
    adxValue: number;
    structure: string;
  };
}

export interface VolumeClimaxResult {
  /** Timestamps where volume ≥ 250% of 20-period average */
  spikes: { time: number; ratio: number }[];
}

export interface VolumeDryUpResult {
  /** Timestamps where volume ≤ 50% of 20-period average */
  dips: { time: number; ratio: number }[];
}

export interface VolumeDivergenceResult {
  /** Timestamps where price makes HH but volume is lower, or price makes LL but volume is lower */
  divergences: { time: number; type: 'bullish' | 'bearish' }[];
}

export interface IndicatorResults {
  rsi: RsiResult | null;
  macd: MacdResult | null;
  bb: BollingerBandsResult | null;
  sma20: SmaResult | null;
  sma50: SmaResult | null;
  sma200: SmaResult | null;
  ema9: EmaResult | null;
  ema21: EmaResult | null;
  volumeProfile: VolumeProfileResult | null;
  adx: AdxResult | null;
  atr: AtrResult | null;
  regime: RegimeResult | null;
  volumeClimax: VolumeClimaxResult | null;
  volumeDryUp: VolumeDryUpResult | null;
  volumeDivergence: VolumeDivergenceResult | null;
}
