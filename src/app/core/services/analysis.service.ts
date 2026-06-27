import { Injectable, inject, signal } from '@angular/core';
import { LlmProvider, LlmMessage } from '../llm/llm-provider';
import { LlmSettingsStore } from '../state/llm-settings.store';
import { TickerStore } from '../state/ticker.store';
import { CacheStore } from '../state/cache.store';
import { AnalysisResult, ConfluenceResult } from '../models/analysis.model';
import { Candle } from '../models/candle.model';
import { IndicatorResults, RegimeResult } from '../models/indicator.model';
import { DetectedPattern } from '../models/pattern.model';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly settingsStore = inject(LlmSettingsStore);
  private readonly tickerStore = inject(TickerStore);
  private readonly cacheStore = inject(CacheStore);

  readonly analyzing = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Run LLM analysis on the current ticker data.
   *
   * After Epic 7, the ConfluenceService deterministically computes
   * direction, tier, probability, signals, and risk. The LLM is now a
   * narrative explainer — it receives the ConfluenceResult and explains
   * the story, rather than recomputing the analysis from raw data.
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
        LlmProvider.shouldUseProxy(config.baseUrl),
      );

      // Epic 7: capture deterministic confluence + regime for narrative prompt
      const confluence = this.tickerStore.confluence();
      const regime = this.tickerStore.regime();
      const timeframe = this.tickerStore.timeframe();

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(ticker, candles, confluence, regime);

      const rawResponse = await provider.complete(systemPrompt, userPrompt);
      const result = this.parseResponse(rawResponse, ticker);

      // Epic 8 Track C: save to analysis history
      if (confluence) {
        this.cacheStore.saveAnalysis(ticker, timeframe, confluence, result).catch(() => {
          // History save is non-critical — ignore errors
        });
      }

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

  /**
   * Ask a follow-up question about the current analysis (Epic 8 Track B).
   * Returns a natural language answer, not structured JSON.
   */
  async askFollowUp(question: string, conversationHistory: LlmMessage[]): Promise<string | null> {
    const config = this.settingsStore.activeConfig();
    if (!config.apiKey || !config.baseUrl) return null;

    const provider = new LlmProvider(
      config.baseUrl,
      config.apiKey,
      config.model,
      config.maxTokens,
      config.temperature,
      LlmProvider.shouldUseProxy(config.baseUrl),
    );

    // Build system context from current confluence + analysis
    const confluence = this.tickerStore.confluence();
    const analysis = this.tickerStore.analysis();

    let systemContext = 'You are a financial market analyst answering follow-up questions about a completed analysis. Be concise and specific. Reference the actual signals and data from the analysis. Do NOT recompute or contradict the deterministic confluence result.\n\nFORMATTING: When making lists, put EACH item on its OWN line with a newline before the bullet. Use "* item" or "1. item" format. Example:\n* First item\n* Second item\n\nDo NOT write lists inline like "Items:* First* Second".';

    if (confluence) {
      systemContext += `\n\nThe deterministic analysis determined: ${confluence.direction.toUpperCase()} direction, ${confluence.tier} confidence tier, ${(confluence.probability * 100).toFixed(0)}% bullish probability.`;
      systemContext += `\nContributing signals: ${confluence.contributingSignals.map((s) => `${s.signal} (${s.appliedModifier > 0 ? '+' : ''}${(s.appliedModifier * 100).toFixed(0)}%)`).join(', ')}.`;
    }

    if (analysis) {
      systemContext += `\n\nThe narrative analysis summary: ${analysis.summary}`;
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: systemContext },
      ...conversationHistory,
      { role: 'user', content: question },
    ];

    try {
      return await provider.completeMultiTurn(messages);
    } catch (err) {
      console.error('Follow-up failed:', err);
      return null;
    }
  }

  /** Build the system prompt — LLM is a narrative explainer, not primary analyst */
  private buildSystemPrompt(): string {
    return `You are an expert financial narrative writer. Your task is to explain a quantitative market analysis in natural language for a retail trader audience. You are NOT a financial advisor — always include appropriate caveats when discussing entry/exit points.

CRITICAL RULES:
1. The quantitative analysis (direction, confidence tier, probability, risk parameters) is DETERMINISTICALLY computed by a rules engine. You CANNOT change or contradict it.
2. Your job is to EXPLAIN the story behind the numbers in plain, accessible language.
3. The trend.direction in your response MUST match the Confluence Direction exactly.
4. The risk.level in your response should use the deterministic engine's tier→risk mapping as a STARTING POINT (HIGH→low, MEDIUM→medium, LOW/NEUTRAL→high), but add nuance in your description if market context warrants it.
5. Use the supplementary indicator data only to add color and context to your narrative.
6. NEVER invent prices, dates, or ticker symbols not provided in the data. If a claim is unsupported, say so.
7. If the confluence probability is near 50%, acknowledge the uncertainty instead of forcing conviction.
8. Provide at least 3 support/resistance levels when possible. The summary should be 3-5 actionable sentences.
9. Return a valid JSON object matching the specified schema exactly. Do NOT include markdown code fences.`;
  }

  /**
   * Build the user prompt.
   *
   * Epic 8 restructured: ConfluenceResult (deterministic) is the PRIMARY
   * input. Raw indicators and patterns are SUPPLEMENTARY context only.
   * Falls back to raw-data prompt when no confluence data exists.
   */
  private buildUserPrompt(
    ticker: string,
    candles: Candle[],
    confluence: ConfluenceResult | null,
    regime: RegimeResult | null,
  ): string {
    const timeframe = this.tickerStore.timeframe();
    const last = candles[candles.length - 1];
    const priceChange = candles.length >= 2
      ? ((last.close - candles[0].close) / candles[0].close * 100).toFixed(2)
      : '0';

    const sections: string[] = [];

    // Asset header
    sections.push(`## Asset\nTicker: ${ticker}\nTimeframe: ${timeframe}\nCandles analyzed: ${candles.length}\nCurrent price: $${last.close.toFixed(2)}\nPeriod high: $${this.max(candles, 'high').toFixed(2)}\nPeriod low: $${this.min(candles, 'low').toFixed(2)}\nPeriod change: ${priceChange}%`);

    if (confluence) {
      // ── Epic 8 Track A: Multi-timeframe weekly context ──────────
      const weeklyConfluence = this.tickerStore.weeklyConfluence();
      if (weeklyConfluence) {
        const weeklyParts: string[] = [
          `## Weekly Timeframe Context`,
          `Direction: ${weeklyConfluence.direction.toUpperCase()}`,
          `Confidence Tier: ${weeklyConfluence.tier}`,
          `Probability: ${(weeklyConfluence.probability * 100).toFixed(0)}% bullish`,
        ];
        if (weeklyConfluence.riskParams.stopLoss) {
          weeklyParts.push(`Weekly Key Support: $${weeklyConfluence.riskParams.stopLoss.toFixed(2)}`);
        }
        if (weeklyConfluence.riskParams.takeProfit) {
          weeklyParts.push(`Weekly Key Resistance: $${weeklyConfluence.riskParams.takeProfit.toFixed(2)}`);
        }
        weeklyParts.push(``);
        weeklyParts.push(`INSTRUCTIONS: Give the weekly structure ~60% weight vs daily ~40% when they conflict. If daily and weekly align, emphasize confluence strength. If they conflict, explain which timeframe typically dominates for this asset class and pattern type. A daily signal that aligns with the weekly structure is a high-conviction setup. A daily signal that contradicts the weekly structure is a counter-trend trade that requires tighter risk management.`);
        sections.push(weeklyParts.join('\n'));
      }

      // ── Epic 8: ConfluenceResult is the PRIMARY input ──────────
      sections.push(this.formatConfluencePrimary(confluence, regime));

      // Supplementary: condensed indicator snapshot (for color/context only)
      const indicators = this.tickerStore.indicators();
      if (indicators) {
        sections.push(this.formatIndicatorsCondensed(indicators));
      }
    } else {
      // ── Fallback: raw data when confluence not available ────────
      const indicators = this.tickerStore.indicators();
      if (indicators) {
        sections.push(this.formatIndicators(indicators));
      }

      const patterns = this.tickerStore.patterns();
      if (patterns.length > 0) {
        sections.push(this.formatPatterns(patterns));
      } else {
        sections.push('## Patterns\nNo candlestick patterns detected.');
      }
    }

    // Schema (unchanged)
    sections.push(this.buildSchemaInstruction());

    return sections.join('\n\n');
  }

  /**
   * Format the deterministic ConfluenceResult as the primary narrative input.
   * The LLM explains this — it does NOT recompute or contradict it.
   */
  private formatConfluencePrimary(
    c: ConfluenceResult,
    regime: RegimeResult | null,
  ): string {
    const lines: string[] = [];

    // ── Header: what the quantitative engine determined ──
    lines.push('## Confluence Analysis (deterministic — DO NOT CHANGE)');
    lines.push(`Direction: ${c.direction.toUpperCase()}`);
    lines.push(`Confidence Tier: ${c.tier}`);
    lines.push(`Bullish Probability: ${(c.probability * 100).toFixed(0)}%`);
    lines.push(`Risk Level (derived from tier): ${c.tier === 'HIGH' ? 'low' : c.tier === 'MEDIUM' ? 'medium' : 'high'}`);

    // ── Regime context ──
    if (regime) {
      lines.push(`\nMarket Regime: ${regime.regime.replace(/_/g, ' ')}`);
      lines.push(`ADX: ${regime.methods.adxValue.toFixed(0)} | SMA Alignment: ${regime.methods.smaAlignment} | Structure: ${regime.methods.structure}`);
    }

    // ── Contributing signals with impact ──
    lines.push(`\n### Evidence (${c.contributingSignals.length} signals)`);
    for (const s of c.contributingSignals) {
      const modifierStr = s.appliedModifier > 0
        ? `+${(s.appliedModifier * 100).toFixed(0)}% bullish`
        : s.appliedModifier < 0
          ? `${(s.appliedModifier * 100).toFixed(0)}% bearish`
          : 'neutral';
      lines.push(`- ${s.signal} [${modifierStr}]: ${s.description}`);
    }

    // ── Risk parameters ──
    if (c.riskParams.stopLoss) {
      lines.push(`\n### Risk Parameters`);
      lines.push(`Stop-Loss: $${c.riskParams.stopLoss.toFixed(2)}`);
      if (c.riskParams.takeProfit) {
        lines.push(`Take-Profit: $${c.riskParams.takeProfit.toFixed(2)}`);
      }
      if (c.riskParams.riskRewardRatio) {
        lines.push(`Risk-Reward: 1:${c.riskParams.riskRewardRatio.toFixed(1)}`);
      }
      if (c.riskParams.positionSize) {
        lines.push(`Position Size: ${c.riskParams.positionSize} shares`);
      }
    }

    // ── Overrides ──
    if (c.overridesApplied.length > 0) {
      lines.push(`\n### 2026 Market Overrides Applied`);
      for (const o of c.overridesApplied) {
        lines.push(`- ${o}`);
      }
    }

    // ── Narrative instructions (Phase 2 enhanced) ──
    lines.push(`\n### Your Task`);
    lines.push('Explain the analysis above in natural language for a retail trader.');
    lines.push('Structure your narrative as:');
    lines.push('(1) What the big picture says (regime + weekly context if available)');
    lines.push('(2) What key evidence drives the conclusion (top 2-3 signals)');
    lines.push('(3) What would invalidate this view (key level to watch)');
    lines.push('(4) What levels matter most for trade management');
    lines.push('');
    lines.push('Your trend.direction MUST match the Confluence Direction exactly.');
    lines.push('Your risk.level MUST match the derived risk level above (use the tier→risk mapping as base, add nuance in description).');
    lines.push('Use the supplementary indicator data below only for narrative color.');
    lines.push('The key levels (support/resistance) should come from the stop-loss and take-profit prices above.');
    lines.push('Set invalidationLevel to the stop-loss price if bullish, or the take-profit price if bearish.');
    lines.push('For convictionNote: "High conviction: N independent signals agree" or "Low conviction: conflicting timeframe signals" etc.');
    lines.push('Provide 1-3 catalysts that could change the outlook.');
    lines.push('For weeklyContext: synthesize how the weekly timeframe influences the daily view (1-2 sentences).');

    return lines.join('\n');
  }

  /** Condensed indicator snapshot — supplementary context only (Phase 2 expanded) */
  private formatIndicatorsCondensed(ind: IndicatorResults): string {
    const lines: string[] = ['## Supplementary Indicators (narrative context only)'];
    const lastPrice = this.tickerStore.candleData().slice(-1)[0]?.close;

    if (ind.rsi) {
      const values = Object.values(ind.rsi.values);
      const lastRsi = values[values.length - 1];
      lines.push(`RSI(${ind.rsi.period}): ${lastRsi?.toFixed(1) ?? 'N/A'}`);
    }

    if (ind.macd) {
      const entries = Object.entries(ind.macd.values);
      const lastMacd = entries[entries.length - 1]?.[1];
      if (lastMacd) {
        const bullCross = lastMacd.macd > lastMacd.signal ? ' (MACD > Signal = bullish)' : ' (MACD < Signal = bearish)';
        lines.push(`MACD: ${lastMacd.macd.toFixed(3)} / Signal: ${lastMacd.signal.toFixed(3)}${bullCross}`);
      }
    }

    // Bollinger Bands position
    if (ind.bb && lastPrice) {
      const bbEntries = Object.entries(ind.bb.values);
      const lastBB = bbEntries[bbEntries.length - 1]?.[1];
      if (lastBB) {
        const posInBands = ((lastPrice - lastBB.lower) / (lastBB.upper - lastBB.lower) * 100);
        const bandPos = posInBands > 80 ? 'near upper band' : posInBands < 20 ? 'near lower band' : 'mid-band';
        lines.push(`BB(${ind.bb.period},${ind.bb.stdDev}): price ${bandPos} (${posInBands.toFixed(0)}% within bands)`);
      }
    }

    // Price vs MAs (context for levels)
    if (lastPrice && ind.sma20) {
      const sma20Vals = Object.values(ind.sma20.values);
      const sma20 = sma20Vals[sma20Vals.length - 1];
      lines.push(`SMA20: ${sma20?.toFixed(2) ?? 'N/A'} (price ${lastPrice > (sma20 ?? 0) ? 'above' : 'below'})`);
    }
    if (lastPrice && ind.sma50) {
      const sma50Vals = Object.values(ind.sma50.values);
      const sma50 = sma50Vals[sma50Vals.length - 1];
      lines.push(`SMA50: ${sma50?.toFixed(2) ?? 'N/A'} (price ${lastPrice > (sma50 ?? 0) ? 'above' : 'below'})`);
    }

    // ADX for trend strength context
    if (ind.adx) {
      const adxVals = Object.values(ind.adx.values);
      const lastAdx = adxVals[adxVals.length - 1];
      const adxStr = lastAdx != null ? (lastAdx > 25 ? 'trending' : 'non-trending') : 'N/A';
      lines.push(`ADX(${ind.adx.period}): ${lastAdx?.toFixed(1) ?? 'N/A'} (${adxStr})`);
    }

    // Volume context (last volume and signals)
    if (lastPrice) {
      const candleData = this.tickerStore.candleData();
      const lastVol = candleData.slice(-1)[0]?.volume ?? 0;
      const recentVols = candleData.slice(-20).map((c) => c.volume);
      const avgVol = recentVols.length > 0 ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : 0;
      const volRatio = avgVol > 0 ? (lastVol / avgVol).toFixed(1) : 'N/A';
      const volSignals: string[] = [];
      if (ind.volumeClimax) volSignals.push('climax detected');
      if (ind.volumeDryUp) volSignals.push('dry-up detected');
      if (ind.volumeDivergence) volSignals.push('divergence detected');
      lines.push(`Volume: ${lastVol.toLocaleString()} (${volRatio}x avg)${volSignals.length > 0 ? ' — ' + volSignals.join(', ') : ''}`);
    }

    return lines.join('\n');
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
  "summary": "3-5 sentence natural language summary of the overall analysis",
  "catalysts": ["string describing an event or level that could change the outlook"],
  "invalidationLevel": number or null (the price that would invalidate the current thesis),
  "convictionNote": "string describing conviction level (e.g., 'High conviction: 3 independent signals agree')",
  "weeklyContext": "1-2 sentence synthesis of how the weekly timeframe influences the daily view, or null if no weekly data"
}`;
  }

  /** Parse the LLM JSON response into AnalysisResult (Phase 2: balanced brace matching) */
  private parseResponse(raw: string, ticker: string): AnalysisResult {
    // Strip potential markdown fences
    let jsonStr = raw.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Balanced brace extraction (handles nested {} in descriptions)
    const firstBrace = jsonStr.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = firstBrace; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        if (jsonStr[i] === '}') {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
      if (end > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, end);
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return this.fallbackResult(ticker, 'Failed to parse LLM response as JSON');
    }

    // Post-parse validation: warn if LLM contradicted deterministic analysis
    const confluence = this.tickerStore.confluence();
    if (confluence && parsed.trend?.['direction']) {
      const llmDirection = parsed.trend['direction'];
      const deterministicDirection = confluence.direction;
      if (llmDirection !== deterministicDirection && deterministicDirection !== 'neutral') {
        console.warn(`LLM contradiction: LLM said "${llmDirection}" but deterministic is "${deterministicDirection}". Auto-correcting.`);
        parsed.trend['direction'] = deterministicDirection;
      }
    }

    const config = this.settingsStore.activeConfig();

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
      // Phase 2 new fields
      catalysts: Array.isArray(parsed['catalysts']) ? parsed['catalysts'].map(String) : [],
      invalidationLevel: parsed['invalidationLevel'] != null ? Number(parsed['invalidationLevel']) : null,
      convictionNote: parsed['convictionNote'] ? String(parsed['convictionNote']) : null,
      weeklyContext: parsed['weeklyContext'] ? String(parsed['weeklyContext']) : null,
      modelInfo: {
        provider: new URL(config.baseUrl).hostname,
        model: config.model,
      },
      rawResponse: raw, // for debugging
    };
  }

  private max(candles: Candle[], field: keyof Candle): number {
    return candles.reduce((m, c) => Math.max(m, c[field] as number), -Infinity);
  }

  private min(candles: Candle[], field: keyof Candle): number {
    return candles.reduce((m, c) => Math.min(m, c[field] as number), Infinity);
  }

  /** Fallback result when JSON parsing fails (e.g., reasoning models) */
  private fallbackResult(ticker: string, errorNote: string): AnalysisResult {
    const config = this.settingsStore.activeConfig();
    return {
      ticker,
      timeframe: this.tickerStore.timeframe(),
      generatedAt: Date.now(),
      trend: {
        direction: 'sideways',
        strength: 'moderate',
        description: `Analysis unavailable — ${errorNote}. Try again or use a different model.`,
      },
      levels: [],
      signals: [],
      risk: {
        level: 'medium',
        score: 50,
        description: 'Unable to assess risk — the model response could not be parsed as JSON.',
      },
      summary: `The model returned a response that could not be parsed as JSON. This happens with reasoning/thinking models (o1, o3, deepseek-reasoner, deepseek-r1, qwen3, qwq). Use a standard chat/instruct model instead: llama3.1, gpt-4o, deepseek-chat, claude-3.5-sonnet, mistral, gemma, phi3.`,
      catalysts: [],
      invalidationLevel: null,
      convictionNote: null,
      weeklyContext: null,
      modelInfo: {
        provider: this.parseHostname(config.baseUrl),
        model: config.model,
      },
    };
  }

  private parseHostname(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
  }
}
