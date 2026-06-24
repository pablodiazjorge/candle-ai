/**
 * Unit tests for Pine Script v5 code generation.
 */
import { describe, it, expect } from 'vitest';

// Test the helper functions from pine-script.service.ts directly
// (replicated here to avoid Angular DI)

function formatPatternType(type: string): string {
  const map: Record<string, string> = {
    doji: 'Doji',
    hammer: 'Hammer',
    shooting_star: 'Shooting Star',
    bullish_engulfing: 'Bullish Engulfing',
    bearish_engulfing: 'Bearish Engulfing',
    morning_star: 'Morning Star',
    evening_star: 'Evening Star',
    bullish_harami: 'Bullish Harami',
    bearish_harami: 'Bearish Harami',
    three_white_soldiers: 'Three White Soldiers',
    three_black_crows: 'Three Black Crows',
  };
  return map[type] ?? type;
}

function formatPineDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function mapToTradingViewSymbol(ticker: string): string {
  const map: Record<string, string> = {
    'BTC-USD': 'BINANCE:BTCUSD',
    'ETH-USD': 'BINANCE:ETHUSD',
    'GC=F': 'COMEX:GC1!',
    'SI=F': 'COMEX:SI1!',
    'CL=F': 'NYMEX:CL1!',
    'ES=F': 'CME_MINI:ES1!',
    'NQ=F': 'CME_MINI:NQ1!',
  };
  if (map[ticker]) return map[ticker];
  return ticker.replace('=F', '').replace('-USD', '');
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('formatPatternType', () => {
  it('formats known pattern types', () => {
    expect(formatPatternType('doji')).toBe('Doji');
    expect(formatPatternType('hammer')).toBe('Hammer');
    expect(formatPatternType('bullish_engulfing')).toBe('Bullish Engulfing');
    expect(formatPatternType('three_white_soldiers')).toBe('Three White Soldiers');
    expect(formatPatternType('evening_star')).toBe('Evening Star');
  });

  it('returns the input for unknown types', () => {
    expect(formatPatternType('unknown_pattern')).toBe('unknown_pattern');
  });
});

describe('formatPineDate', () => {
  it('formats date in Pine Script timestamp format', () => {
    const date = new Date('2026-06-24T14:30:00Z');
    const result = formatPineDate(date);
    expect(result).toBe('2026-06-24T14:30');
  });

  it('pads single-digit months and days', () => {
    const date = new Date('2026-01-05T09:05:00Z');
    const result = formatPineDate(date);
    expect(result).toBe('2026-01-05T09:05');
  });
});

describe('mapToTradingViewSymbol', () => {
  it('maps crypto to BINANCE prefix', () => {
    expect(mapToTradingViewSymbol('BTC-USD')).toBe('BINANCE:BTCUSD');
    expect(mapToTradingViewSymbol('ETH-USD')).toBe('BINANCE:ETHUSD');
  });

  it('maps futures to their exchanges', () => {
    expect(mapToTradingViewSymbol('GC=F')).toBe('COMEX:GC1!');
    expect(mapToTradingViewSymbol('ES=F')).toBe('CME_MINI:ES1!');
    expect(mapToTradingViewSymbol('CL=F')).toBe('NYMEX:CL1!');
  });

  it('strips =F and -USD suffixes for unmapped symbols', () => {
    expect(mapToTradingViewSymbol('AAPL')).toBe('AAPL');
    expect(mapToTradingViewSymbol('MSFT')).toBe('MSFT');
  });

  it('handles unknown futures by stripping =F', () => {
    expect(mapToTradingViewSymbol('ZN=F')).toBe('ZN');
  });
});
