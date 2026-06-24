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
}
