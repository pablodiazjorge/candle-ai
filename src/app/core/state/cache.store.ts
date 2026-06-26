import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Candle } from '../models/candle.model';
import { ConfluenceResult, AnalysisResult } from '../models/analysis.model';

interface CachedCandles {
  id?: number;
  key: string; // `${symbol}_${interval}_${range}`
  candles: Candle[];
  cachedAt: number; // Date.now()
}

/** Epic 8 Track C: Persisted analysis history for comparison */
export interface AnalysisHistoryEntry {
  id?: number;
  ticker: string;
  timeframe: string;
  timestamp: number;
  confluence: ConfluenceResult;
  analysis: AnalysisResult | null;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable({ providedIn: 'root' })
export class CacheStore extends Dexie {
  candles!: Table<CachedCandles, number>;
  analysisHistory!: Table<AnalysisHistoryEntry, number>;

  constructor() {
    super('CandleAiCache');
    this.version(3).stores({
      candles: '++id, key, cachedAt',
      analysisHistory: '++id, [ticker+timeframe], timestamp',
    });
  }

  /** Build cache key from symbol + interval + range */
  static buildKey(symbol: string, interval: string, range: string): string {
    return `${symbol.toUpperCase()}_${interval}_${range}`;
  }

  /** Get cached candles if not expired */
  async get(key: string): Promise<Candle[] | null> {
    const entry = await this.candles.where('key').equals(key).first();
    if (!entry) return null;

    const age = Date.now() - entry.cachedAt;
    if (age > TTL_MS) {
      await this.candles.where('key').equals(key).delete();
      return null;
    }

    return entry.candles;
  }

  /** Store candles in cache */
  async set(key: string, candles: Candle[]): Promise<void> {
    // Upsert: delete existing then add
    await this.candles.where('key').equals(key).delete();
    await this.candles.add({
      key,
      candles,
      cachedAt: Date.now(),
    });
  }

  /** Clear all cached data */
  async clearAll(): Promise<void> {
    await this.candles.clear();
  }

  /** Remove expired entries */
  async purgeExpired(): Promise<void> {
    const cutoff = Date.now() - TTL_MS;
    await this.candles.where('cachedAt').below(cutoff).delete();
  }

  // ── Epic 8 Track C: Analysis History ──────────────────────────

  /** Save an analysis run to history */
  async saveAnalysis(
    ticker: string,
    timeframe: string,
    confluence: ConfluenceResult,
    analysis: AnalysisResult | null,
  ): Promise<void> {
    await this.analysisHistory.add({
      ticker: ticker.toUpperCase(),
      timeframe,
      timestamp: Date.now(),
      confluence,
      analysis,
    });
  }

  /** Get analysis history for a ticker+timeframe, newest first */
  async getAnalysisHistory(
    ticker: string,
    timeframe: string,
    limit: number = 10,
  ): Promise<AnalysisHistoryEntry[]> {
    return this.analysisHistory
      .where('[ticker+timeframe]')
      .equals([ticker.toUpperCase(), timeframe])
      .reverse()
      .sortBy('timestamp')
      .then((entries) => entries.slice(0, limit));
  }

  /** Get the most recent analysis for a ticker+timeframe */
  async getLatestAnalysis(
    ticker: string,
    timeframe: string,
  ): Promise<AnalysisHistoryEntry | null> {
    const entries = await this.getAnalysisHistory(ticker, timeframe, 1);
    return entries[0] ?? null;
  }

  /** Purge analysis history older than 30 days */
  async purgeOldHistory(): Promise<void> {
    const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
    await this.analysisHistory.where('timestamp').below(cutoff).delete();
  }
}
