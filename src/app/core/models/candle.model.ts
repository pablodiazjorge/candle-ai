/** OHLCV candle with timestamp */
export interface Candle {
  /** Unix timestamp in seconds */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Convert raw Yahoo Finance response to Candle[] */
export function candlesFromYahoo(
  timestamps: number[],
  quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] },
): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open[i];
    const h = quote.high[i];
    const l = quote.low[i];
    const c = quote.close[i];
    const v = quote.volume[i];
    if (o != null && h != null && l != null && c != null) {
      candles.push({
        time: timestamps[i],
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v ?? 0,
      });
    }
  }
  return candles;
}
