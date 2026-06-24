import { Injectable, inject, signal } from '@angular/core';
import { LlmProvider } from '../llm/llm-provider';
import { LlmSettingsStore } from '../state/llm-settings.store';
import { TickerStore } from '../state/ticker.store';
import { AnalysisResult } from '../models/analysis.model';
import { Candle } from '../models/candle.model';
import { IndicatorResults } from '../models/indicator.model';
import { DetectedPattern } from '../models/pattern.model';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly settingsStore = inject(LlmSettingsStore);
  private readonly tickerStore = inject(TickerStore);

  readonly analyzing = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Run LLM analysis on the current ticker data.
   * Requires indicators and/or patterns to provide meaningful output.
   */
  async runAnalysis(): Promise<AnalysisResult | null> {
    const config = this.settingsStore.activeConfig();
    if (!config.apiKey || !config.baseUrl) {
      this.error.set('LLM not configured. Set API key in settings.');
      return null;
    }

    const ticker = this.tickerStore.selectedTicker();
    if (!ticker) {
      this.error.set('No ticker selected.');
      return null;
    }

    const candles = this.tickerStore.candleData();
    if (candles.length === 0) {
      this.error.set('No market data loaded.');
      return null;
    }

    this.analyzing.set(true);
    this.error.set(null);

    try {
      const provider = new LlmProvider(
        config.baseUrl,
        config.apiKey,
        config.model,
        config.maxTokens,
        config.temperature,
      );

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(ticker, candles);

      const rawResponse = await provider.complete(systemPrompt, userPrompt);
      const result = this.parseResponse(rawResponse, ticker);

      this.analyzing.set(false);
      return result;
    } catch (err) {
      this.analyzing.set(false);
      const message = (err as Error).message || 'Unknown error';
      this.error.set(message);
      console.error('LLM analysis failed:', err);
      return null;
    }
  }

  /** Build the system prompt with instructions for the LLM */
  private buildSystemPrompt(): string {
    return `You are an expert financial market analyst. Your task is to analyze technical indicators and candlestick patterns for a given financial instrument and provide a structured JSON analysis.

Rules:
1. Be objective and data-driven. Base your analysis ONLY on the provided data.
2. Use clear, concise language. Avoid speculation.
3. Identify key support and resistance levels from price action.
4. Evaluate risk based on volatility, indicator readings, and pattern signals.
5. Return a valid JSON object matching the specified schema exactly.
6. Do NOT include markdown code fences, only raw JSON.`;
  }

  /** Build the user prompt with indicator + pattern + price data */
  private buildUserPrompt(ticker: string, candles: Candle[]): string {
    const indicators = this.tickerStore.indicators();
    const patterns = this.tickerStore.patterns();
    const timeframe = this.tickerStore.timeframe();

    const last = candles[candles.length - 1];
    const priceChange = candles.length >= 2
      ? ((last.close - candles[0].close) / candles[0].close * 100).toFixed(2)
      : '0';

    const sections: string[] = [];

    // Ticker info
    sections.push(`## Asset\nTicker: ${ticker}\nTimeframe: ${timeframe}\nCandles analyzed: ${candles.length}`);
    sections.push(`Current price: $${last.close.toFixed(2)}\nPeriod high: $${this.max(candles, 'high').toFixed(2)}\nPeriod low: $${this.min(candles, 'low').toFixed(2)}\nPeriod change: ${priceChange}%`);

    // Indicators
    if (indicators) {
      sections.push(this.formatIndicators(indicators));
    }

    // Patterns
    if (patterns.length > 0) {
      sections.push(this.formatPatterns(patterns));
    } else {
      sections.push('## Patterns\nNo candlestick patterns detected.');
    }

    // Schema
    sections.push(this.buildSchemaInstruction());

    return sections.join('\n\n');
  }

  private formatIndicators(ind: IndicatorResults): string {
    const lines: string[] = ['## Technical Indicators'];

    if (ind.rsi) {
      const values = Object.values(ind.rsi.values);
      const lastRsi = values[values.length - 1];
      lines.push(`RSI (${ind.rsi.period}): ${lastRsi?.toFixed(1) ?? 'N/A'}`);
    }

    if (ind.macd) {
      const entries = Object.entries(ind.macd.values);
      const lastMacd = entries[entries.length - 1]?.[1];
      if (lastMacd) {
        lines.push(`MACD (${ind.macd.fastPeriod},${ind.macd.slowPeriod},${ind.macd.signalPeriod}): MACD=${lastMacd.macd}, Signal=${lastMacd.signal}, Histogram=${lastMacd.histogram}`);
      }
    }

    if (ind.bb) {
      const entries = Object.entries(ind.bb.values);
      const lastBB = entries[entries.length - 1]?.[1];
      if (lastBB) {
        lines.push(`Bollinger Bands (${ind.bb.period},${ind.bb.stdDev}): Upper=${lastBB.upper}, Middle=${lastBB.middle}, Lower=${lastBB.lower}`);
      }
    }

    for (const sma of [{ key: 'sma20', label: 'SMA 20' }, { key: 'sma50', label: 'SMA 50' }, { key: 'sma200', label: 'SMA 200' }] as const) {
      const data = ind[sma.key];
      if (data) {
        const vals = Object.values(data.values);
        const lastVal = vals[vals.length - 1];
        lines.push(`${sma.label} (${data.period}): ${lastVal?.toFixed(2) ?? 'N/A'}`);
      }
    }

    for (const ema of [{ key: 'ema9', label: 'EMA 9' }, { key: 'ema21', label: 'EMA 21' }] as const) {
      const data = ind[ema.key];
      if (data) {
        const vals = Object.values(data.values);
        const lastVal = vals[vals.length - 1];
        lines.push(`${ema.label} (${data.period}): ${lastVal?.toFixed(2) ?? 'N/A'}`);
      }
    }

    return lines.join('\n');
  }

  private formatPatterns(patterns: DetectedPattern[]): string {
    const bullish = patterns.filter((p) => p.sentiment === 'bullish');
    const bearish = patterns.filter((p) => p.sentiment === 'bearish');
    const neutral = patterns.filter((p) => p.sentiment === 'neutral');

    const lines: string[] = ['## Candlestick Patterns'];
    lines.push(`Total detected: ${patterns.length} (${bullish.length} bullish, ${bearish.length} bearish, ${neutral.length} neutral)`);

    const recent = patterns.slice(-8);
    for (const p of recent) {
      lines.push(`- ${p.type} (${p.sentiment}, confidence: ${(p.confidence * 100).toFixed(0)}%)`);
    }

    return lines.join('\n');
  }

  private buildSchemaInstruction(): string {
    return `## Response Schema
Return a JSON object with this exact structure:
{
  "trend": {
    "direction": "bullish" | "bearish" | "sideways",
    "strength": "weak" | "moderate" | "strong",
    "description": "Brief explanation of the trend"
  },
  "levels": [
    { "price": number, "type": "support" | "resistance", "strength": "weak" | "moderate" | "strong", "description": "string" }
  ],
  "signals": [
    { "indicator": "RSI" | "MACD" | "BB" | "SMA" | "EMA" | "Pattern", "signal": "buy" | "sell" | "neutral", "description": "string" }
  ],
  "risk": {
    "level": "low" | "medium" | "high",
    "score": number (0-100),
    "description": "Risk assessment explanation"
  },
  "summary": "2-3 sentence natural language summary of the overall analysis"
}`;
  }

  /** Parse the LLM JSON response into AnalysisResult */
  private parseResponse(raw: string, ticker: string): AnalysisResult {
    // Strip potential markdown fences
    let jsonStr = raw.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    return {
      ticker,
      timeframe: this.tickerStore.timeframe(),
      generatedAt: Date.now(),
      trend: {
        direction: parsed.trend?.['direction'] ?? 'sideways',
        strength: parsed.trend?.['strength'] ?? 'moderate',
        description: parsed.trend?.['description'] ?? 'No trend analysis available.',
      },
      levels: Array.isArray(parsed.levels) ? parsed.levels.map((l: Record<string, unknown>) => ({
        price: Number(l['price']) || 0,
        type: (l['type'] === 'resistance' ? 'resistance' : 'support') as 'support' | 'resistance',
        strength: (['weak', 'moderate', 'strong'].includes(l['strength'] as string) ? l['strength'] : 'moderate') as 'weak' | 'moderate' | 'strong',
        description: String(l['description'] || ''),
      })) : [],
      signals: Array.isArray(parsed.signals) ? parsed.signals.map((s: Record<string, unknown>) => ({
        indicator: String(s['indicator'] || 'Unknown'),
        signal: (['buy', 'sell', 'neutral'].includes(s['signal'] as string) ? s['signal'] : 'neutral') as 'buy' | 'sell' | 'neutral',
        description: String(s['description'] || ''),
      })) : [],
      risk: {
        level: (['low', 'medium', 'high'].includes(parsed.risk?.['level'] as string) ? parsed.risk['level'] : 'medium') as 'low' | 'medium' | 'high',
        score: Math.min(100, Math.max(0, Number(parsed.risk?.['score']) || 50)),
        description: String(parsed.risk?.['description'] || 'No risk assessment available.'),
      },
      summary: String(parsed['summary'] || 'Analysis completed.'),
    };
  }

  private max(candles: Candle[], field: keyof Candle): number {
    return candles.reduce((m, c) => Math.max(m, c[field] as number), -Infinity);
  }

  private min(candles: Candle[], field: keyof Candle): number {
    return candles.reduce((m, c) => Math.min(m, c[field] as number), Infinity);
  }
}
