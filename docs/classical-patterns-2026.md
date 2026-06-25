# Candle AI: Classical Patterns Applied to 2026 Markets

## Purpose

The classical patterns catalogued in `classical-patterns.md` was built from
academic literature spanning the 1990s through early 2000s. Markets in 2026
are fundamentally different: algorithmic trading, fragmented liquidity, 24/7
crypto markets, and zero-day options have reshaped how price patterns form,
behave, and — critically — how often they fail.

This document adapts every classical pattern to the reality of 2026 markets.
It is not a replacement for the classical reference; it is the **modern
application layer** that sits on top of it. Where the classical document says
"a Hammer at support is a bullish reversal," this document says "...but only if
it survives the first 15 minutes of the next session without being algo-faded."

---

## 1. The Great Pattern Decline (1990s → 2026)

### 1.1 The Hard Data

Bulkowski's multi-decade study tracks 56 chart patterns across three decades.
The results are sobering. Here are the patterns most affected:

| Pattern | 1990s Avg Rise | 2000s | 2010s | Decline |
|---------|---------------|-------|-------|---------|
| **Flags** | 14% | 12% | **6%** | −57% |
| **Pennants** | 10% | 7% | **4%** | −60% |
| **Descending Triangle (up)** | 51% | 37% | **27%** | −47% |
| **Ascending Triangle** | 47% | 47% | **35%** | −25% |
| **Symmetrical Triangle** | 41% | 38% | **29%** | −29% |
| **Double Bottom (A&A)** | 45% | 62% | **35%** | −22% |
| **Head & Shoulders Bottom** | 45% | 46% | **44%** | −2% |

And the patterns that **held or improved**:

| Pattern | 1990s | 2000s | 2010s | Trend |
|---------|-------|-------|-------|-------|
| **Bump & Run Reversal Bottom** | 44% | 67% | **65%** | ↑ |
| **Complex H&S Bottom** | 41% | 45% | **62%** | ↑ |
| **Rounding Bottom** | 55% | 66% | **56%** | → |
| **Cup with Handle** | 49% | 54% | **55%** | ↑ |
| **Rounding Top (down)** | 21% | 16% | **18%** | → |

### 1.2 The Shark-32 Finding

Bulkowski's Shark-32 analysis quantified what many traders suspected: the
average market trend is **30% shorter today than in the 1990s**. He concluded
it is "30% harder to make money today than it was two decades ago." The
implication for pattern analysis is direct — patterns have less time to
mature, targets are reached less frequently, and false breakouts are more
common.

### 1.3 The Pattern That Explains Everything

Look at the two lists above. The **dividing line** is clear:

- **Short-duration, small patterns** (Flags, Pennants, Triangles under 15 bars)
  → degraded 25–60%
- **Long-duration, structural patterns** (H&S, Rounding, Cup & Handle, Bump &
  Run) → held steady or improved

**Why**: Short patterns are statistical noise that algorithms exploit. A
3-bar flag is a probability distribution that HFT systems can fade, front-run,
and liquidate within milliseconds. A 30-bar Head & Shoulders represents a
genuine shift in supply/demand equilibrium — it cannot be algorithmically
simulated. The market still respects structural imbalance; it no longer
respects micro-consolidations.

---

## 2. Why Classical Patterns Are Failing

### 2.1 Algorithmic Predation (60%+ of US Equity Volume)

Algorithmic trading, particularly high-frequency trading (HFT), doesn't just
execute faster — it **hunts predictable patterns**. When a classic flag forms
with a clean pole and parallel channel, algorithms detect it before the human
eye can. They:

1. **Front-run the breakout**: Place orders at the expected breakout level,
   triggering a brief spike that retail traders chase
2. **Fade the breakout**: Sell into the spike, knowing that the pattern's
   statistical edge has already been priced in
3. **Hunt the stop-loss**: Push price below the flag support to trigger
   pattern-trader stops, then reverse

This is why Flags went from 14% average gain to 6%. The pattern still forms —
it just no longer delivers.

### 2.2 Market Fragmentation

Volume in 2026 is spread across 16+ lit exchanges, 40+ dark pools, and
internalizers. The "volume" reported on a candlestick chart represents only
a fraction of total market activity. A "high volume breakout" might be 30%
of actual volume — the other 70% is invisible, executing in dark pools.

**Implication**: Volume confirmation rules designed in the 1990s (when 90%+
of volume was visible on NYSE/NASDAQ) overestimate volume significance today.
A pattern with "above average" visible volume may have below-average total
volume. Volume confirmation thresholds should be raised.

### 2.3 Zero-Day Options (0DTE) Distortion

Since their explosion in 2022–2024, 0DTE options have introduced massive
intraday gamma effects that distort candlestick formations:

- **Pin risk at strikes**: Price magnetically gravitates toward high-open-interest
  strikes on expiration days, creating false support/resistance
- **Afternoon reversals**: Gamma hedging unwinds in the final hour, often
  reversing morning patterns completely
- **Fake breakouts**: A breakout above resistance at 10:00 AM may be entirely
  gamma-driven, reversing by 3:30 PM when hedges unwind

**Implication**: Candlestick patterns formed on Mondays, Wednesdays, and
Fridays (peak 0DTE days) have lower reliability. Wait for the daily close
before confirming any pattern that formed intraday.

### 2.4 The Passive Investing Tsunami

As of 2026, passive funds (ETFs, index funds) control over 55% of US equity
assets. These flows are **price-insensitive** — they buy regardless of pattern,
valuation, or volume. This creates:

- **Persistent uptrends that ignore bearish patterns**: A Shooting Star at the
  top of an SPY rally means less when 401(k) contributions arrive every two
  weeks regardless
- **Reduced volatility in large caps**: Mega-cap stocks (AAPL, MSFT, NVDA) show
  fewer clean candlestick patterns because passive flows smooth price action
- **Pattern reliability inversion**: Classical patterns work better on mid-cap
  and small-cap stocks where passive ownership is lower

---

## 3. Pattern-by-Pattern 2026 Adaptations

### 3.1 Single Candlestick Patterns

#### Doji

**Classical view**: Indecision. Potential reversal at trend extremes.

**2026 reality**: A Doji in SPY or QQQ is noise. Passive flows and algo
market-making produce Dojis constantly. Only respect a Doji when:
- It forms on a **stock with < 30% institutional ownership** (less passive
  distortion)
- It appears at a **structural** support/resistance level (not a moving
  average, not a round number)
- The next candle confirms within the **first 30 minutes** of the next session
  (not end-of-day — algos will have already priced it in)

**Grade adjustment**: D → stays D. Dojis were never reliable; they are even
less so now.

#### Hammer / Hanging Man

**Classical view**: Bullish reversal (Hammer) or bearish warning (Hanging Man).

**2026 reality**: The Hammer is one of the few single-candle patterns that
**still works** — but only when volume on the Hammer candle is ≥ 150% of the
20-period average. Without volume, assume it's an algo liquidity sweep.

**Critical adaptation**: A Hammer below the prior day's low that recovers is
stronger than a Hammer that never breached the prior low. The first shows
genuine absorption of selling; the second may just be a random walk.

**Hanging Man**: More dangerous in 2026 than in 1990. The passive bid means
uptrends persist longer, so a Hanging Man is more likely to be a false alarm.
**Require a bearish confirmation candle that closes below the Hanging Man's
low**, not just a lower close.

**Grade adjustment**: B → stays B, but volume requirement is now mandatory.

#### Shooting Star / Inverted Hammer

**Classical view**: Bearish reversal (Star) or bullish reversal (Inv. Hammer).

**2026 reality**: The Shooting Star **gains reliability** in 2026 because
algorithms fade extended rallies mechanically. When a Star forms after 5+
consecutive green candles, algos interpret it as a mean-reversion trigger and
amplify the reversal.

**Critical adaptation**: A Shooting Star that forms in the **last hour** of a
session (3:00–4:00 PM ET) is more reliable than one forming at 10:30 AM.
Afternoon Stars capture genuine exhaustion; morning Stars are often noise.

**Grade adjustment**: C → B (when after 5+ green candles + afternoon formation).

### 3.2 Double Candlestick Patterns

#### Engulfing Patterns

**Classical view**: Strong reversal signals.

**2026 reality**: The Engulfing pattern is the **most algo-faded** of all
candlestick patterns. Algorithms are programmed to recognize engulfing
formations and trade against them. The pattern still has value, but entry
timing is everything:

- **NEVER enter on the engulfing candle's close**. Wait for the next candle
  to confirm — and ideally wait for the first 30 minutes of that next session
  to pass.
- The engulfing candle's body must be **≥ 150% of the prior candle's body**
  (not just "larger"). The extra requirement filters out borderline engulfings
  that algos ignore.
- A Bullish Engulfing that closes **above the prior 3 candles' highs** is a
  genuine demand shock. A Bullish Engulfing that only covers the prior candle
  is noise.

**Grade adjustment**: B → C without confirmation; B with the enhanced criteria.

#### Harami

**Classical view**: Moderate reversal warning.

**2026 reality**: The Harami's "contraction after expansion" logic is
undermined by algorithms that compress ranges mechanically as part of
inventory management. A Harami in 2026 is more likely to be an algo resting
than genuine exhaustion.

**Require**: Candle 2's range must be **≤ 25% of Candle 1's range** (not just
"smaller") for the Harami to be meaningful. The extreme contraction filters
out routine algo range compression.

**Grade adjustment**: C → D without the extreme range contraction requirement.

#### Piercing Line / Dark Cloud Cover

**Classical view**: Strong reversal signals. Piercing Line ~64% win rate.

**2026 reality**: These patterns **still hold their edge** remarkably well
because they are less commonly hunted by retail-focused algos. The gap-open
requirement makes them harder to fake.

**Critical adaptation**: The gap must be a **true gap** — the open must be
outside the prior candle's range, not just below the close. A "gap" of 0.1%
is noise. Require the open to be at least 0.3% beyond the prior range.

**Grade adjustment**: B → stays B. One of the few patterns that has not
significantly degraded.

### 3.3 Triple Candlestick Patterns

#### Morning Star / Evening Star

**Classical view**: Highest-reliability candlestick reversals (~68%).

**2026 reality**: The Star patterns **still work** but with an important
caveat: the middle candle must show genuine indecision, not just a small body.
A small-body candle in a low-volatility environment (VIX < 15) is the default
state, not indecision.

**Critical adaptation**: The middle candle must have a range **wider** than
the 10-period average range. A wide-range small-body candle shows genuine
battle between supply and demand. A narrow-range small body in a low-VIX
environment is meaningless.

**Grade adjustment**: A → stays A (with the wide-range middle candle filter).

#### Three White Soldiers / Three Black Crows

**Classical view**: Sustained directional conviction (~63%).

**2026 reality**: These patterns are **fading in reliability** because
persistent directional moves are now more likely to be passive-flow-driven
than conviction-driven. Three consecutive green candles in SPY may simply be
three days of 401(k) contributions, not accumulation.

**Critical adaptation**: Each candle must show **increasing volume** (not just
"not declining"). If volume decreases on any of the three candles, the pattern
is downgraded two grades.

**Grade adjustment**: B → C (without increasing volume on all three candles).

### 3.4 Chart Patterns — Reversal

#### Head & Shoulders

**Classical view**: The gold standard of reversal patterns (~74-81% reliability).

**2026 reality**: **Still the gold standard.** H&S patterns represent
structural supply/demand shifts that algorithms cannot simulate. The key 2026
adaptation is **timeframe** — H&S patterns on daily charts remain reliable;
on intraday charts (1h, 4h), they are noise.

**Enhanced volume requirement**: Volume must decline across the three peaks
for the pattern to be Grade A. Flat volume = Grade B at best. Rising volume
at the right shoulder invalidates the pattern — it suggests the trend still
has participation.

**Grade adjustment**: A → stays A (daily timeframe; B on intraday).

#### Double Top / Double Bottom

**Classical view**: Double auction failure (~67-68%).

**2026 reality**: **Degraded on large caps, intact on small/mid caps.** The
passive bid in mega-caps means double bottoms often hold simply because ETFs
buy the dip mechanically. A Double Bottom on SPY is less meaningful than a
Double Bottom on a $2B market cap stock.

**Critical adaptation**: The time between the two peaks/troughs must be **at
least 15 candles** (up from the classical 8). The shorter the pattern, the
more likely it's algorithmic noise.

**Grade adjustment**: A → B (large caps); A (small/mid caps with 15+ candle
separation).

#### Island Reversal

**Classical view**: Extremely rare, extremely reliable (~79%).

**2026 reality**: **Nearly extinct in equities, still viable in crypto.**
With 24-hour futures markets and extended-hours trading, true gaps are rare
in modern equity markets. Crypto markets, trading 24/7 with no closing auction,
still produce genuine gaps on exchange-specific charts.

**Grade adjustment**: A → A (crypto); B (equities, due to gap authenticity
concerns).

### 3.5 Chart Patterns — Continuation

#### Flags & Pennants

**Classical view**: Reliable continuation (~67%).

**2026 reality**: **The most degraded pattern class.** Flags went from 14%
average gain (1990s) to 6% (2010s). Pennants: 10% to 4%. These patterns are
now **below the threshold of statistical usefulness** for standalone trading.

**The only Flag that still works**: The **High & Tight Flag** (pole ≥ 20% in
≤ 8 candles, flag retracement ≤ 15%). This specific subtype concentrates enough
momentum that algos struggle to fade it without taking inventory risk.

**2026 rule**: If you detect a standard Flag, treat it as neutral — it
provides zero directional edge. Only the High & Tight variant carries weight.

**Grade adjustment**: B → D (standard Flags); B (High & Tight only).

#### Triangles (Ascending, Descending, Symmetrical)

**Classical view**: Reliable continuation (Ascending ~70%, Descending ~64%,
Symmetrical ~54%).

**2026 reality**: All triangle patterns have degraded significantly. Bulkowski's
data shows:
- Ascending: 47% → 35% (25% decline)
- Descending: 51% → 27% (47% decline)
- Symmetrical: 41% → 29% (29% decline)

**Why**: Triangles are "predictable within a range" — exactly the type of
pattern algorithms are designed to exploit. The converging lines create obvious
breakout levels that get front-run.

**Critical adaptation**: Only trade triangle breakouts that occur **before**
the 65% point of the triangle's width (Bulkowski's finding: the median breakout
is at 61-65% of the way to the apex). Breakouts after 65% are false moves.

**Grade adjustment**: A → B (all triangles, with the 65% rule).

#### Cup & Handle

**Classical view**: Bullish continuation (~61%).

**2026 reality**: **One of the few patterns that improved.** From 49% (1990s)
to 55% (2010s). The pattern's long duration (20-60+ candles) and complex shape
make it difficult for algorithms to fake. The handle's shakeout function still
works — weak hands are shaken out regardless of market structure.

**Grade adjustment**: B → stays B. Reliable but subjective detection remains
the limitation.

---

## 4. Volume in 2026: The Half-Truth Indicator

### 4.1 What "Volume" Actually Means Now

The volume printed on a candlestick chart in 2026 is **lit exchange volume
only**. It excludes:

- Dark pool transactions (estimated 30-40% of total US equity volume)
- Internalized orders (broker-dealer matching, another 10-15%)
- Auction-only volume (closing auction represents 7-10% of daily volume in
  a single print)

**The visible volume on a candle may represent only 40-50% of total market
activity.** This fundamentally changes how volume confirmation works.

### 4.2 Revised Volume Rules for 2026

| Classical Rule | 2026 Adaptation |
|---------------|-----------------|
| "Above average volume confirms" | Volume must be ≥ 150% of 20-period average (up from ~120%) |
| "Volume declining = pattern weakening" | Neutral — declining visible volume may mean volume moved to dark pools |
| "Volume climax = reversal" | Requires ≥ 250% of average (up from 200%) to filter algo liquidity events |
| "Low volume = no conviction" | Check the **closing auction volume** (available via most data providers). Low candle volume + high auction volume = conviction concentrated at the close |

### 4.3 The Closing Auction Signal

The most underutilized volume signal in 2026 is the **closing auction
imbalance**. When a pattern candle closes with a large auction imbalance
(≥ 5% of daily volume executed in the closing print), it signals that
institutional participants — not algos, not retail — drove the closing price.
A Hammer with a large closing auction buy imbalance is significantly more
reliable than a Hammer with high intraday volume.

---

## 5. Crypto Markets: Different Rules

Cryptocurrency markets violate several foundational assumptions of classical
technical analysis:

### 5.1 24/7 Trading — No Closing Auction

Classical patterns were developed for markets with a defined session close.
The daily close is the most important price in traditional TA — it reflects
the final auction result. Crypto has no close. The "daily candle" close time
is arbitrary (usually 00:00 UTC, but varies by exchange).

**Adaptation**: Use **UTC midnight close** as the reference, but be aware that
different exchanges show different candles. Patterns detected on Binance may
not appear on Coinbase. For Candle AI, standardize on one data source and
document which one.

### 5.2 Extreme Volatility Compresses Pattern Reliability

A 3% move in Bitcoin is a normal day. The same pattern criteria designed for
equities (where 3% is extraordinary) produce far more false positives in crypto.

**Adaptation**: Relax body-to-range ratio criteria by 50% for crypto. A "small
body" in Bitcoin might be 0.6% of price, not 0.3%.

### 5.3 Funding Rate as a Synthetic "Volume Conviction"

Crypto perpetual futures have a unique signal: the **funding rate**. A positive
funding rate means longs pay shorts — the market is overleveraged long. A
pattern with extremely positive funding (> 0.05% per 8h) is suspect regardless
of how clean it looks.

**Adaptation**: Bullish patterns with funding > 0.05% are downgraded one grade.
Bearish patterns with funding < −0.05% are downgraded one grade. The funding
rate acts as a "conviction tax" — too much conviction in one direction means
the pattern is crowded.

### 5.4 Exchange Volume Is Even Less Reliable

Crypto exchange volume data is notoriously inflated by wash trading, zero-fee
market makers, and exchange token incentives. Reported volume on some exchanges
is 10-20× actual economic volume.

**Adaptation**: For crypto, use **only Tier-1 exchange data** (Binance,
Coinbase, Kraken) and ignore volume from lower-tier exchanges entirely.
Better yet, use **on-chain volume** (transfer volume, not exchange-reported).

---

## 6. Timeframe Considerations for 2026

### 6.1 The Daily Candle Is Still King

Despite all the changes in market microstructure, the **daily timeframe**
remains the most reliable for classical pattern analysis. Intraday patterns
(1h, 4h, 15m) are so heavily algo-dominated that they provide minimal
statistical edge for retail timeframes.

### 6.2 The Weekly Candle Is Underrated

Weekly patterns are **less affected by algorithmic distortion** because:
- HFT algorithms operate on microsecond-to-minute horizons; they don't
  manipulate weekly formations
- Passive flows (401k, ETF creation/redemption) are weekly phenomena
- Pattern breakouts on weekly charts take days to confirm, giving the analyst
  time to act without being front-run

A Head & Shoulders on the weekly chart is the highest-confidence signal
available in 2026 technical analysis.

### 6.3 Intraday Patterns: The 30-Minute Rule

If you must use intraday patterns:
- Ignore the first 30 minutes of the session (opening auction noise)
- Ignore the last 30 minutes (closing auction positioning)
- The middle of the session (10:00 AM – 3:30 PM ET) produces the cleanest
  intraday patterns — but even these are 40-50% less reliable than daily
  equivalents

---

## 7. Implementation Priorities

The adjusted implementation order — reflecting which patterns still work in
2026 and which have degraded — is defined in
[development-roadmap.md](development-roadmap.md), Epic 6 (Quantitative
Foundation).

---

## 8. The Confluence Model — 2026 Calibration

The probabilistic confluence model in `analytical-framework.md` Section 5
used signal modification values based on classical win rates. These must be
recalibrated for 2026:

### 8.1 Updated Signal Modification Table

| Signal Type | Grade | Regime-Aligned | Counter-Regime | vs Classical |
|-------------|-------|---------------|----------------|-------------|
| Market Structure shift | — | ±0.20 | ±0.20 | Unchanged — structure is timeless |
| Chart Pattern (H&S, Double) | A | ±0.15 | ±0.08 | Unchanged |
| Chart Pattern (Triangle) | B | ±0.08 | ±0.04 | **Reduced from ±0.10/±0.05** |
| Chart Pattern (Flag/Pennant) | B | ±0.05 | ±0.02 | **Reduced from ±0.10/±0.05** |
| Candlestick (Star patterns) | A | ±0.12 | ±0.05 | **Increased from ±0.10/±0.03** — Stars gained relative value |
| Candlestick (Engulfing) | B | ±0.07 | ±0.02 | **Reduced from ±0.09/±0.03** |
| Candlestick (single) | C+ | ±0.05 | ±0.01 | **Reduced from ±0.07/±0.02** |
| Volume Confirmation | — | ×1.3 | ×0.7 | **Tightened** — volume is harder to confirm |
| Volume Absent | — | ×0.7 | ×0.6 | Unchanged |

### 8.2 The "Passive Flow Override"

A new modifier for 2026: when analyzing mega-cap stocks (>$200B market cap)
or major ETFs (SPY, QQQ, IWM), all bullish signals receive a **×1.1 multiplier**
and all bearish signals receive a **×0.9 multiplier**. This accounts for the
structural bid from passive flows that makes bearish reversals harder and
bullish continuations easier in these instruments.

### 8.3 The "0DTE Gamma Override"

On Mondays, Wednesdays, and Fridays — peak 0DTE expiration days — all intraday
patterns (timeframe < daily) are downgraded one confidence tier. A HIGH
confidence intraday signal on a Wednesday becomes MEDIUM. This override does
not apply to daily or weekly patterns.

---

## 9. Summary: What Changed

| Aspect | Classical (1990-2010) | 2026 Reality |
|--------|----------------------|--------------|
| **Flag/Pennant reliability** | 67% | ~40% (standard); viable only as High & Tight |
| **Triangle reliability** | 64-70% | 27-35% average gain; 65% rule mandatory |
| **H&S / Double Top-Bottom** | 67-75% | Still 65-75% on daily/weekly |
| **Volume confirmation** | > 120% avg | > 150% avg; closing auction preferred |
| **Single candle patterns** | C-D grade | Stay C-D; never standalone |
| **Star patterns** | A grade | Stay A with wide-range middle candle |
| **Best timeframe** | Any | Daily is king; weekly is underrated |
| **Crypto applicability** | N/A | Same patterns, relaxed ratios, funding-rate filter |
| **Passive flow effect** | None | Structural bullish bias in mega-caps/ETFs |
| **0DTE effect** | None | Downgrade intraday patterns on M/W/F |

### The Single Most Important Adaptation

**Pattern complexity and duration are now the primary reliability factors.**
The longer and more structurally complex a pattern, the more it resists
algorithmic degradation. A 3-candle flag is algorithmic prey. A 30-candle
Head & Shoulders is still genuine supply/demand imbalance.

Candle AI should implement pattern detection in order of duration/complexity —
longest patterns first, shortest last — because that order mirrors the
declining reliability curve of modern markets.

---

## References

- Bulkowski, T. (2020). "Chart Pattern Performance over Decades."
  ThePatternSite.com. — Primary source for decade-by-decade performance data.
- Bulkowski, T. (2013/2025). "Shark-32 Pattern." ThePatternSite.com. —
  Methodology for measuring pattern deterioration and crypto-specific testing.
- Bulkowski, T. (2021). *Encyclopedia of Chart Patterns* (3rd ed.). Wiley.
- Lewis, M. (2014). *Flash Boys*. W.W. Norton. — Definitive account of HFT
  and market structure transformation.
- Fama, E. (1970). "Efficient Capital Markets: A Review of Theory and
  Empirical Work." *Journal of Finance*, 25(2), 383-417.
- U.S. Securities and Exchange Commission. (2024). "Market Structure
  Statistics." — Dark pool and off-exchange volume estimates.
- Various authors. (2022-2026). "0DTE Options and Market Microstructure."
  *Financial Analysts Journal* and industry white papers.
