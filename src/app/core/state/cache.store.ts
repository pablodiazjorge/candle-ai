import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Candle } from '../models/candle.model';

interface CachedCandles {
  id?: number;
  key: string; // `${symbol}_${interval}_${range}`
  candles: Candle[];
  cachedAt: number; // Date.now()
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable({ providedIn: 'root' })
export class CacheStore extends Dexie {
  candles!: Table<CachedCandles, number>;

  constructor() {
    super('CandleAiCache');
    this.version(2).stores({
      candles: '++id, key, cachedAt',
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
}
