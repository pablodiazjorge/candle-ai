/**
 * Unit tests for AnalysisService — LLM narrative layer.
 * Covers: parseResponse(), fallbackResult(), buildSystemPrompt(),
 * buildUserPrompt(), formatConfluencePrimary(), formatIndicatorsCondensed(),
 * and askFollowUp() message construction.
 *
 * NOTE: Tests the pure logic. Full integration with LlmProvider
 * is tested at the component level (analysis-dashboard.spec.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular inject() — all services use inject() for DI
const injectMocks = new Map<unknown, unknown>();

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual,
    inject: vi.fn((token: unknown) => {
      if (injectMocks.has(token)) return injectMocks.get(token);
      throw new Error(`No mock for inject(${String(token)})`);
    }),
    Injectable: actual['Injectable'],
    signal: actual['signal'],
    computed: actual['computed'],
    effect: actual['effect'],
  };
});

import { AnalysisService } from './analysis.service';
import { LlmSettingsStore } from '../state/llm-settings.store';
import { TickerStore } from '../state/ticker.store';
import { CacheStore } from '../state/cache.store';
import { AnalysisResult, ConfluenceResult, SignalContribution } from '../models/analysis.model';
import { Candle } from '../models/candle.model';
import { IndicatorResults, RegimeResult } from '../models/indicator.model';
import { DetectedPattern } from '../models/pattern.model';
import { LlmProvider } from '../llm/llm-provider';

// ─── Test Helpers ──────────────────────────────────────────────────

function makeCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 100 + i * 0.5,
    high: 102 + i * 0.5,
    low: 99 + i * 0.5,
    close: 101 + i * 0.5,
    volume: 1000000,
  }));
}

function makeConfluence(overrides: Partial<ConfluenceResult> = {}): ConfluenceResult {
  return {
    direction: 'bullish',
    tier: 'HIGH',
    probability: 0.82,
    contributingSignals: [
      {
        signal: 'Double Bottom (A)',
        direction: 'bullish',
        baseModifier: 0.15,
        appliedModifier: 0.12,
        description: 'Classic double bottom with 18-candle separation and volume confirmation.',
      },
      {
        signal: 'RSI Bullish Divergence',
        direction: 'bullish',
        baseModifier: 0.10,
        appliedModifier: 0.08,
        description: 'Price made lower low while RSI made higher low.',
      },
    ],
    riskParams: {
      stopLoss: 97.50,
      takeProfit: 112.50,
      riskRewardRatio: 3.0,
      positionSize: 200,
    },
    overridesApplied: ['Passive Flow Override: ×1.1 bullish (SPY is mega-cap ETF)'],
    ...overrides,
  };
}

function makeRegime(): RegimeResult {
  return {
    regime: 'strong_uptrend',
    confidence: 0.85,
    methods: {
      smaAlignment: 'bullish',
      adxValue: 32,
      structure: 'HH/HL',
    },
  };
}

function makeIndicators(): IndicatorResults {
  return {
    rsi: { values: { 1700086400: 58.5 }, period: 14 },
    macd: {
      values: { 1700086400: { macd: 1.2, signal: 0.8, histogram: 0.4 } },
      fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    },
    bb: { values: { 1700086400: { upper: 110, middle: 100, lower: 90 } }, period: 20, stdDev: 2 },
    sma20: { values: { 1700086400: 98.5 }, period: 20 },
    sma50: { values: { 1700086400: 95.0 }, period: 50 },
    sma200: null,
    ema9: null,
    ema21: null,
    volumeProfile: null,
    adx: null,
    volumeClimax: null,
    volumeDryUp: null,
    volumeDivergence: null,
  };
}

function setupAnalysisService(mocks: {
  settingsStore?: Partial<LlmSettingsStore>;
  tickerStore?: Partial<TickerStore>;
  cacheStore?: Partial<CacheStore>;
} = {}): AnalysisService {
  injectMocks.clear();

  // Default ticker store mocks
  injectMocks.set(TickerStore, {
    selectedTicker: vi.fn(() => 'SPY'),
    timeframe: vi.fn(() => '1d'),
    candleData: vi.fn(() => makeCandles(100)),
    confluence: vi.fn(() => null),
    weeklyConfluence: vi.fn(() => null),
    regime: vi.fn(() => null),
    indicators: vi.fn(() => null),
    patterns: vi.fn(() => []),
    analysis: vi.fn(() => null),
    setAnalysis: vi.fn(),
    ...mocks.tickerStore,
  });

  // Default LLM settings store mocks
  injectMocks.set(LlmSettingsStore, {
    activeConfig: vi.fn(() => ({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      maxTokens: 2048,
      temperature: 0.3,
    })),
    isConfigured: vi.fn(() => true),
    hasApiKey: vi.fn(() => true),
    ...mocks.settingsStore,
  });

  // Default cache store mocks
  injectMocks.set(CacheStore, {
    saveAnalysis: vi.fn(() => Promise.resolve()),
    getAnalysisHistory: vi.fn(() => Promise.resolve([])),
    ...mocks.cacheStore,
  });

  return new AnalysisService();
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('AnalysisService', () => {
  let service: AnalysisService;

  beforeEach(() => {
    vi.restoreAllMocks();
    injectMocks.clear();
  });

  // ── parseResponse() ──────────────────────────────────────────────

  describe('parseResponse()', () => {
    beforeEach(() => {
      service = setupAnalysisService();
    });

    it('should parse valid JSON response correctly', () => {
      const raw = JSON.stringify({
        trend: { direction: 'bullish', strength: 'strong', description: 'Clear uptrend.' },
        levels: [
          { price: 97.5, type: 'support', strength: 'strong', description: 'Recent swing low.' },
          { price: 112.5, type: 'resistance', strength: 'moderate', description: 'Prior high.' },
        ],
        signals: [
          { indicator: 'RSI', signal: 'buy', description: 'RSI bouncing from 40.' },
          { indicator: 'MACD', signal: 'buy', description: 'MACD crossed above signal.' },
        ],
        risk: { level: 'low', score: 20, description: 'Strong support nearby.' },
        summary: 'SPY shows bullish momentum with strong support.',
      });

      const result = (service as any).parseResponse(raw, 'SPY');

      expect(result.ticker).toBe('SPY');
      expect(result.trend.direction).toBe('bullish');
      expect(result.trend.strength).toBe('strong');
      expect(result.levels).toHaveLength(2);
      expect(result.levels[0].price).toBe(97.5);
      expect(result.levels[0].type).toBe('support');
      expect(result.signals).toHaveLength(2);
      expect(result.signals[0].indicator).toBe('RSI');
      expect(result.signals[0].signal).toBe('buy');
      expect(result.risk.level).toBe('low');
      expect(result.risk.score).toBe(20);
      expect(result.summary).toContain('SPY');
    });

    it('should strip markdown code fences', () => {
      const raw = '```json\n{"trend":{"direction":"bearish","strength":"weak","description":"test"},"levels":[],"signals":[],"risk":{"level":"high","score":80,"description":"test"},"summary":"test"}\n```';

      const result = (service as any).parseResponse(raw, 'TEST');

      expect(result.trend.direction).toBe('bearish');
      expect(result.trend.strength).toBe('weak');
    });

    it('should extract JSON from reasoning model output (CoT prefix)', () => {
      const raw = 'Let me analyze this step by step...\n\nThe market shows a bullish structure.\n\n{"trend":{"direction":"bullish","strength":"moderate","description":"test"},"levels":[],"signals":[],"risk":{"level":"medium","score":50,"description":"test"},"summary":"test"}';

      const result = (service as any).parseResponse(raw, 'TEST');

      expect(result.trend.direction).toBe('bullish');
    });

    it('should return fallback on invalid JSON', () => {
      const raw = 'This is not JSON at all.';

      const result = (service as any).parseResponse(raw, 'TEST');

      expect(result.trend.direction).toBe('sideways');
      expect(result.risk.score).toBe(50);
      expect(result.summary).toContain('could not be parsed');
    });

    it('should return fallback on empty string', () => {
      const result = (service as any).parseResponse('', 'TEST');

      expect(result.trend.direction).toBe('sideways');
      expect(result.levels).toHaveLength(0);
    });

    it('should clamp risk score to 0-100', () => {
      const raw = JSON.stringify({
        trend: { direction: 'sideways', strength: 'weak', description: '' },
        levels: [],
        signals: [],
        risk: { level: 'medium', score: 150, description: 'test' },
        summary: 'test',
      });

      const result = (service as any).parseResponse(raw, 'TEST');
      expect(result.risk.score).toBe(100);

      const raw2 = JSON.stringify({
        trend: { direction: 'sideways', strength: 'weak', description: '' },
        levels: [],
        signals: [],
        risk: { level: 'medium', score: -10, description: 'test' },
        summary: 'test',
      });

      const result2 = (service as any).parseResponse(raw2, 'TEST');
      expect(result2.risk.score).toBe(0);
    });

    it('should handle JSON with nested braces in descriptions', () => {
      const raw = JSON.stringify({
        trend: { direction: 'bullish', strength: 'moderate', description: 'Price broke above {key resistance}.' },
        levels: [{ price: 105, type: 'resistance', strength: 'moderate', description: 'Previous {swing high} at 105.' }],
        signals: [],
        risk: { level: 'medium', score: 50, description: 'test' },
        summary: 'Test {nested} braces.',
      });

      const result = (service as any).parseResponse(raw, 'TEST');

      expect(result.trend.description).toContain('{key resistance}');
      expect(result.summary).toContain('{nested}');
    });

    it('should handle missing fields with defaults', () => {
      const raw = JSON.stringify({});

      const result = (service as any).parseResponse(raw, 'TEST');

      expect(result.trend.direction).toBe('sideways');
      expect(result.trend.strength).toBe('moderate');
      expect(result.levels).toHaveLength(0);
      expect(result.signals).toHaveLength(0);
      expect(result.risk.level).toBe('medium');
      expect(result.risk.score).toBe(50);
      expect(result.summary).toBe('Analysis completed.');
    });
  });

  // ── buildSystemPrompt() ──────────────────────────────────────────

  describe('buildSystemPrompt()', () => {
    beforeEach(() => {
      service = setupAnalysisService();
    });

    it('should include critical rules for the LLM', () => {
      const prompt = (service as any).buildSystemPrompt();

      expect(prompt).toContain('DETERMINISTICALLY computed');
      expect(prompt).toContain('CANNOT change or contradict');
      expect(prompt).toContain('EXPLAIN the story');
      expect(prompt).toContain('Return a valid JSON object');
    });

    it('should include tier-to-risk mapping', () => {
      const prompt = (service as any).buildSystemPrompt();

      expect(prompt).toContain('HIGH');
      expect(prompt).toContain('MEDIUM');
      expect(prompt).toContain('LOW/NEUTRAL');
      expect(prompt).toContain('STARTING POINT');
    });
  });

  // ── formatConfluencePrimary() ────────────────────────────────────

  describe('formatConfluencePrimary()', () => {
    beforeEach(() => {
      service = setupAnalysisService();
    });

    it('should format bullish confluence result correctly', () => {
      const c = makeConfluence();
      const regime = makeRegime();
      const result = (service as any).formatConfluencePrimary(c, regime);

      expect(result).toContain('Direction: BULLISH');
      expect(result).toContain('Confidence Tier: HIGH');
      expect(result).toContain('Bullish Probability: 82%');
      expect(result).toContain('Risk Level (derived from tier): low');
      expect(result).toContain('Double Bottom (A)');
      expect(result).toContain('RSI Bullish Divergence');
      expect(result).toContain('Stop-Loss: $97.50');
      expect(result).toContain('Take-Profit: $112.50');
      expect(result).toContain('Risk-Reward: 1:3.0');
      expect(result).toContain('Passive Flow Override');
    });

    it('should format bearish NEUTRAL confluence', () => {
      const c = makeConfluence({
        direction: 'bearish',
        tier: 'NEUTRAL',
        probability: 0.48,
        contributingSignals: [],
        overridesApplied: [],
      });
      const result = (service as any).formatConfluencePrimary(c, null);

      expect(result).toContain('Direction: BEARISH');
      expect(result).toContain('Confidence Tier: NEUTRAL');
      expect(result).toContain('Risk Level (derived from tier): high');
    });

    it('should include regime context when provided', () => {
      const c = makeConfluence({ contributingSignals: [], overridesApplied: [] });
      const regime = makeRegime();
      const result = (service as any).formatConfluencePrimary(c, regime);

      expect(result).toContain('Market Regime: strong uptrend');
      expect(result).toContain('ADX: 32');
      expect(result).toContain('SMA Alignment: bullish');
    });

    it('should handle missing risk params gracefully', () => {
      const c = makeConfluence({
        riskParams: { stopLoss: null, takeProfit: null, riskRewardRatio: null, positionSize: null },
        contributingSignals: [],
        overridesApplied: [],
      });
      const result = (service as any).formatConfluencePrimary(c, null);

      expect(result).not.toContain('Stop-Loss');
    });
  });

  // ── buildUserPrompt() ────────────────────────────────────────────

  describe('buildUserPrompt()', () => {
    beforeEach(() => {
      service = setupAnalysisService();
    });

    it('should include asset header with ticker info', () => {
      const candles = makeCandles(50);
      const c = makeConfluence();
      const regime = makeRegime();

      const prompt = (service as any).buildUserPrompt('SPY', candles, c, regime);

      expect(prompt).toContain('## Asset');
      expect(prompt).toContain('Ticker: SPY');
      expect(prompt).toContain('Timeframe: 1d');
      expect(prompt).toContain('Candles analyzed: 50');
      expect(prompt).toContain('Current price:');
    });

    it('should include confluence primary when available', () => {
      const candles = makeCandles(50);
      const c = makeConfluence();
      const regime = makeRegime();

      const prompt = (service as any).buildUserPrompt('SPY', candles, c, regime);

      expect(prompt).toContain('## Confluence Analysis (deterministic');
      expect(prompt).toContain('Direction: BULLISH');
    });

    it('should include weekly context when available', () => {
      const tickerStore = injectMocks.get(TickerStore) as any;
      tickerStore.weeklyConfluence = vi.fn(() => makeConfluence({ direction: 'bullish', tier: 'MEDIUM', probability: 0.65 }));

      const candles = makeCandles(50);
      const c = makeConfluence();
      const regime = makeRegime();

      const prompt = (service as any).buildUserPrompt('SPY', candles, c, regime);

      expect(prompt).toContain('## Weekly Timeframe Context');
      expect(prompt).toContain('Direction: BULLISH');
      expect(prompt).toContain('Confidence Tier: MEDIUM');
    });

    it('should use fallback format when no confluence', () => {
      const tickerStore = injectMocks.get(TickerStore) as any;
      tickerStore.indicators = vi.fn(() => makeIndicators());
      tickerStore.patterns = vi.fn(() => [
        { type: 'doji', time: 1700086400, sentiment: 'neutral', confidence: 0.8, labelKey: 'pattern.doji' } as DetectedPattern,
      ]);

      const candles = makeCandles(50);

      const prompt = (service as any).buildUserPrompt('SPY', candles, null, null);

      expect(prompt).toContain('## Technical Indicators');
      expect(prompt).toContain('## Candlestick Patterns');
      expect(prompt).not.toContain('## Confluence Analysis');
    });

    it('should include response schema instruction', () => {
      const candles = makeCandles(50);
      const c = makeConfluence();

      const prompt = (service as any).buildUserPrompt('SPY', candles, c, null);

      expect(prompt).toContain('## Response Schema');
      expect(prompt).toContain('"trend"');
      expect(prompt).toContain('"levels"');
      expect(prompt).toContain('"risk"');
      expect(prompt).toContain('"summary"');
    });
  });

  // ── formatIndicatorsCondensed() ──────────────────────────────────

  describe('formatIndicatorsCondensed()', () => {
    beforeEach(() => {
      service = setupAnalysisService();
    });

    it('should show condensed RSI and MACD values', () => {
      const ind = makeIndicators();
      const result = (service as any).formatIndicatorsCondensed(ind);

      expect(result).toContain('Supplementary Indicators');
      expect(result).toContain('RSI(14): 58.5');
      expect(result).toContain('MACD: 1.200 / Signal: 0.800');
    });

    it('should show SMA values with price context', () => {
      const ind = makeIndicators();
      const result = (service as any).formatIndicatorsCondensed(ind);

      expect(result).toContain('SMA20: 98.50');
      expect(result).toContain('SMA50: 95.00');
    });
  });

  // ── askFollowUp() message construction ───────────────────────────

  describe('askFollowUp()', () => {
    it('should return null when LLM not configured', async () => {
      service = setupAnalysisService({
        settingsStore: {
          activeConfig: vi.fn(() => ({ baseUrl: '', apiKey: '', model: '', maxTokens: 0, temperature: 0 })),
          isConfigured: vi.fn(() => false),
          hasApiKey: vi.fn(() => false),
        },
      });

      const result = await service.askFollowUp('Question?', []);
      expect(result).toBeNull();
    });

    it('should include confluence context in system message', async () => {
      service = setupAnalysisService();
      const tickerStore = injectMocks.get(TickerStore) as any;
      tickerStore.confluence = vi.fn(() => makeConfluence());
      tickerStore.analysis = vi.fn(() => null);

      // Mock fetch for the LLM call
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ index: 0, message: { role: 'assistant', content: 'Answer' }, finish_reason: 'stop' }],
        }),
      }) as unknown as typeof fetch;

      await service.askFollowUp('Why bullish?', [
        { role: 'user', content: 'Previous question?' },
        { role: 'assistant', content: 'Previous answer.' },
      ]);

      const fetchCall = (globalThis.fetch as unknown as vi.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      const systemMsg = body.messages[0].content;

      expect(systemMsg).toContain('BULLISH direction');
      expect(systemMsg).toContain('HIGH confidence tier');
      expect(systemMsg).toContain('82% bullish');
      expect(systemMsg).toContain('Double Bottom');
      expect(systemMsg).toContain('RSI Bullish Divergence');
    });
  });
});
