# Confluence Engine: V1 → V2 Evolution

> Technical reference documenting the two generations of the Candle AI
> deterministic confluence engine. V1 shipped in Epic 7 (June 2026).
> V2 shipped in Epic 9 (June 2026).

---

## Architecture Comparison

| Aspect | V1.0 (Epic 7) | V2.0 (Epic 9) |
|--------|--------------|--------------|
| **Update rule** | `pBullish += signedModifier` | `logOdds += clamp(logLR, ±2.0)` |
| **Evidence scale** | Arithmetic probability modifiers | Log-likelihood ratios (log-LR) |
| **Pattern grading** | C/D flattened to B | Grade multipliers: A=1.0×, B=0.6×, C=0.3×, D=0.1× |
| **Signal aging** | Binary window (30/60 candles) | Continuous exponential decay `exp(−λt)` |
| **Correlated signals** | 4× engulfing → +0.28 → 95% cap | Clustered → merged → ~72% |
| **Volume** | ×1.2 confirm, ×0.7 contradict | Directional context (buy_climax vs sell_climax) |
| **Market structure** | None | BOS, CHoCH, Liquidity Sweep |
| **Risk stops** | Fixed R:R by tier | ATR-percentile adaptive |
| **Cross-asset** | US mega-cap + 0DTE only | VIX, DXY correlation, forex structural inverse |
| **Asset universality** | US-centric defaults | Adaptive thresholds per asset volatility |
| **Tier thresholds** | 0.75/0.60/0.50 | 0.72/0.58/0.50 (Bayesian converges conservatively) |

---

## V1.0: Arithmetic Probability (Epic 7)

### Core Algorithm

```
pBullish = REGIME_BASE[regime]  // 0.40 – 0.60
pBullish += Σ patternModifiers  // +0.15, -0.07, etc.
pBullish *= volumeMultiplier    // ×1.2, ×0.8, ×0.7
pBullish = clamp(pBullish, 0.05, 0.95)
tier = computeTier(pBullish)    // 0.75+/0.60+/0.50+
```

### Evidence Constants (additive)

```typescript
const EVIDENCE = {
  CHART_PATTERN_A:  { aligned: 0.15, counter: 0.08 },
  CANDLE_PATTERN_A: { aligned: 0.10, counter: 0.03 },
  CANDLE_PATTERN_B: { aligned: 0.07, counter: 0.02 },
  RSI_DIVERGENCE:   { aligned: 0.08, counter: 0.05 },
  MACD_CROSSOVER:   { aligned: 0.06, counter: 0.03 },
  VOLUME_CONFIRM:   1.2,  // multiplicative
  VOLUME_CONTRA:    0.7,
  VOLUME_ABSENT:    0.8,
};
```

### Limitations (addressed in V2)

1. **Overconfidence from correlated signals** — 4× Bullish Engulfing in 5 candles = +0.28 = 95% cap. Reality: same market event, not independent evidence.
2. **Grade C/D treated as B** — `GradingService` output was decorative. C and D patterns contributed identically to B.
3. **No temporal decay** — 30-day-old signal had same weight as yesterday's. In BTC daily, a signal from 29 days ago could be pre-halving.
4. **Volume multiplier was a hack** — ×1.2 on aggregate probability, not per-signal. Buy climax vs sell climax indistinguishable.
5. **Fixed R:R per tier** — 1:3 for MEDIUM regardless of asset. BTC (60% ann vol) vs AAPL (20% ann vol) — absurd.
6. **No SMC detection** — Algorithms trade BOS/CHoCH/Liquidity Sweep, not "Bullish Engulfing."
7. **US-centric** — 0DTE gamma applied to ALL intraday timeframes (forex, crypto). Passive flow only for 12 US tickers.

---

## V2.0: Bayesian Inference (Epic 9)

### Core Algorithm

```
pBullish = REGIME_BASE[regime]
For each signal:
  baseLogLR   = EVIDENCE_LOG_LR[type][aligned|counter]
  gradeMult   = GRADE_MULTIPLIER[grade]          // 0.1 – 1.0
  decayWeight = exp(−λ_eff × daysAgo)            // volatility-adjusted
  effectiveLR = baseLogLR × gradeMult × decayWeight
  signedLR    = direction === 'bullish' ? +LR : −LR
  pBullish    = bayesianUpdate(pBullish, signedLR, cap=2.0)
pBullish = clamp(pBullish, 0.05, 0.95)
tier = computeTier(pBullish)                     // 0.72/0.58/0.50
```

### Bayesian Update Function

```typescript
function bayesianUpdate(p: number, logLR: number, cap = 2.0): number {
  const clampedLR = Math.max(Math.min(logLR, cap), -cap);
  const logOdds = Math.log(p / (1 - p));
  const newLogOdds = logOdds + clampedLR;
  const newOdds = Math.exp(newLogOdds);
  return clamp(newOdds / (1 + newOdds), 0.02, 0.98);
}
```

The cap at ±2.0 prevents overconfidence explosion. With uncapped log-LR,
4× signals at 0.60 each would reach 99.9% — the cap keeps it grounded.

Each step clamps its result to [0.02, 0.98], so contrary evidence can always
move p back from the extremes; the final [0.05, 0.95] clamp still applies to
the reported probability.

### Evidence Constants (log-LR scale)

| Signal | Aligned | Counter | Equivalent LR |
|--------|---------|---------|---------------|
| Chart Pattern A | 0.60 | 0.30 | 1.82 / 1.35 |
| Chart Pattern B | 0.40 | 0.20 | 1.49 / 1.22 |
| Candle Pattern A | 0.40 | 0.20 | 1.49 / 1.22 |
| Candle Pattern B | 0.28 | 0.14 | 1.32 / 1.15 |
| RSI Divergence | 0.35 | 0.18 | 1.42 / 1.20 |
| MACD Crossover | 0.25 | 0.12 | 1.28 / 1.13 |
| SMC BOS | 0.60 | 0.30 | 1.82 / 1.35 |
| SMC CHoCH | 0.70 | 0.35 | 2.01 / 1.42 |
| SMC Liquidity Sweep | 0.50 | 0.25 | 1.65 / 1.28 |
| Volume Confirm | 0.25 | — | 1.28 |
| Volume Contradict | −0.35 | — | 0.70 |

### Grade Multipliers

| Grade | Multiplier | Effective Weight |
|-------|-----------|-----------------|
| A | 1.0 | 100% of base log-LR |
| B | 0.6 | 60% |
| C | 0.3 | 30% |
| D | 0.1 | 10% |

### Temporal Decay

```typescript
λ_base per timeframe:
  1m: 2.0   5m: 1.5   15m: 1.0   1h: 0.5
  4h: 0.3   1d: 0.15  1wk: 0.05  1mo: 0.02

λ_eff = λ_base × (1 + min(atr14/sma20, 3.0))
weight = exp(−λ_eff × daysAgo), clamped to [0.01, 1.0]
```

For daily BTC (ATR ~$2500, price ~$60K): λ_eff ≈ 0.15 × 1.04 = 0.156.
A 30-day-old signal retains ~1% of fresh weight. A 7-day-old: ~34%.
A yesterday signal: ~86%.

---

## V2 Signal Hierarchy

Five-level hierarchy with Bayesian integration at each level:

| Level | Category | Signals | Integration |
|-------|----------|---------|-------------|
| 1 | **Market Regime** | ADX + SMA alignment + structure | Base rate (0.40 – 0.60) |
| 2 | **SMC** | BOS, CHoCH, Liquidity Sweep | logLR 0.50 – 0.70 |
| 2.5 | **Chart Patterns** | Double Top/Bottom, H&S | Clustered, logLR 0.40 – 0.60 |
| 3 | **Candlestick Patterns** | 11 patterns | Clustered, logLR 0.28 – 0.40 |
| 4 | **Momentum** | RSI divergence, MACD crossover | logLR 0.25 – 0.35 |
| 5 | **Volume** | Climax type + delta direction | logLR −0.35 to +0.25 |
| 6 | **Market Context** | VIX, DXY, funding rate | Global logLR adjustment |
| 7 | **2026 Overrides** | Passive flow, 0DTE gamma | Multiplicative (legacy) |

### Volume Directional Logic

| Climax Type | Regime | Interpretation | logLR | Why |
|------------|--------|---------------|-------|-----|
| Buy climax | Uptrend | Distribution (bearish) | −0.35 | Smart money selling into strength |
| Buy climax | Downtrend | Capitulation (bullish) | +0.25 | Absorption at support |
| Sell climax | Uptrend | Distribution (bearish) | −0.35 | Profit-taking at highs |
| Sell climax | Downtrend | Capitulation (bullish) | +0.25 | Exhaustion of selling |

### Proximity Clustering

Patterns of the same type and sentiment within ≤3 candles are merged:
- Representative gets `max(logLR) + 0.05 × (n−1)` bonus
- Bonus capped at 1.5× the max individual logLR
- Prevents 4× engulfing from being counted as 4 independent signals

---

## Risk Parameters: V1 vs V2

| Aspect | V1.0 | V2.0 |
|--------|------|------|
| **Stop-loss source** | Swing point (10-candle window) | Swing point + ATR(14) floor |
| **SL distance** | Swing distance (capped 20%) | `atr14 × multiplier` (adaptive) |
| **SL multiplier** | N/A | High vol: 2.5×, Normal: 2.0×, Low vol: 1.5× |
| **R:R ratio** | Fixed: HIGH=2, MEDIUM=3 | Adaptive: HIGH=1.5–3.0, MEDIUM=2.0–4.0 |
| **Volatility awareness** | None | ATR percentile vs 100-candle history |
| **Risk cap** | 20% of entry (all assets) | `clamp(atrPct × 5, 1%, 20%)` |
| **Position sizing** | `(Account × 2%) / risk` | Same formula (unchanged) |

### Adaptive Risk Cap (per asset)

| Asset | ATR% | Cap | Rationale |
|-------|------|-----|-----------|
| BTC-USD | ~4.2% | 20% | High vol, 5× ATR exceeds 20% cap |
| AAPL | ~2.5% | 12.5% | Moderate vol |
| SPY | ~1.5% | 7.5% | Moderate vol |
| EUR/USD | ~0.5% | 2.3% | Low vol forex — 20% would be 2000 pips |
| TLT (bonds) | ~1.7% | 8.3% | Moderate vol |

---

## Asset-Class Universality

| Feature | US Equities | Crypto | Forex | Commodities | Intl Stocks |
|---------|:----------:|:------:|:-----:|:-----------:|:-----------:|
| 0DTE Gamma | ✅ SPY/QQQ/IWM + mag-7 | ❌ | ❌ | ❌ | ❌ |
| Passive Flow | ✅ Mega-caps + ETFs | ❌ | ❌ | ❌ | ❌ |
| DXY Correlation | Computed 30d | Excluded (weak) | Structural −0.12 | Computed 30d | Computed 30d |
| VIX | ^VIX | — | — | — | ^VIX |
| Funding Rate | — | Planned (Binance) | — | — | — |
| Trend Threshold | ATR-adaptive (min 0.5%) | ATR-adaptive | ATR-adaptive (∼0.5% floor critical) | ATR-adaptive | ATR-adaptive |

### 0DTE Gate

Only 18 US tickers are subject to 0DTE gamma neutralization:
`SPY`, `QQQ`, `IWM`, `DIA`, `AAPL`, `TSLA`, `NVDA`, `META`, `GOOGL`, `GOOG`, `AMZN`, `MSFT`, `AMD`, `NFLX`, `CRM`, `BA`, `DIS`, `UBER`

Forex (24/5), crypto (24/7), commodities, and international stocks skip this override.

### Trend Detection

Uses volatility-adaptive threshold instead of fixed 3%:
```
threshold = max(1.5 × atr14/price × √period, 0.5%)
```
- BTC: ATR $2500 / $60K = 4.2%, × √20 ≈ 18.6%, × 1.5 ≈ 27.9% threshold
- SPY: ATR $5 / $500 = 1%, × √20 ≈ 4.5%, × 1.5 ≈ 6.7% threshold
- EUR/USD: ATR 0.004 / 1.08 ≈ 0.37%, × √20 ≈ 1.7%, × 1.5 ≈ 2.5% threshold
- Floor at 0.5% ensures forex still detects trends. No ceiling — high-vol
  assets legitimately require larger thresholds to filter noise.

---

## Performance

| Metric | V1.0 | V2.0 |
|--------|------|------|
| **Computation** | O(n) synchronous | O(n) + O(m²) for clustering (m = patterns, typically <20) |
| **Memory** | Negligible | +SwingPoint array (~100 entries), +ATR map |
| **Latency** | <1ms | <2ms (clustering + SMC) |
| **Worker dependency** | None | ATR(14) from worker (optional, fallback to sync) |

---

## Migration Guide

V1 callers need zero changes. The `score()` signature is backward compatible:

```typescript
// V1 — still works
service.score(regime, patterns, indicators, candles, ticker);

// V2 with all features
service.score(regime, patterns, indicators, candles, ticker,
  accountSize,       // optional
  timeframe,         // optional, default '1d'
  marketContext,     // optional, from MarketContextService
);
```

The `ConfluenceResult` shape is unchanged. New signal types (SMC, volume context, market context) appear in `contributingSignals[]` automatically — no UI changes needed.

---

## ADRs

- **ADR-014**: Log-Odds Bayesian Update over Arithmetic Summation — `architecture.md`
- **ADR-015**: Async Market Context Preload — `architecture.md`
- **ADR-016**: Product Naming and Two-Layer Communication — `architecture.md`
- **Epic 9**: Full description in `development-roadmap.md`

---

## Files

| File | V1 Lines | V2 Lines | Change |
|------|----------|----------|--------|
| `confluence.service.ts` | ~586 | ~850 | +264 |
| `confluence.service.spec.ts` | ~350 | ~430 | +80 |
| `pattern.model.ts` | 31 | 48 | +17 (SMCSignal) |
| `analysis.model.ts` | 104 | 119 | +15 (MarketContext) |
| `indicator.model.ts` | 134 | 141 | +7 (AtrResult) |
| `indicators.worker.ts` | ~520 | ~550 | +30 (calcAtr) |
| `market-context.service.ts` | — | 122 | NEW |
| `ticker.store.ts` | ~140 | ~150 | +10 |
| `app.ts` | ~260 | ~275 | +15 |
| **Total** | ~2,125 | ~2,685 | ~560 |
