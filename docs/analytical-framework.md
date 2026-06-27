# Candle AI: Analytical Framework

## Purpose

This document defines the **analytical methodology** that powers Candle AI. It
describes not just *what* I compute, but *why* each computation matters and
*how* signals combine to produce actionable insight.

It serves three audiences:

- **Contributors** — technical specification for implementing the analysis engine
- **Users** — transparency into how the application reaches its conclusions
- **Reviewers** — a single source of truth for the analytical philosophy

All analysis is **probabilistic, not predictive**. Candle AI estimates the
*balance of evidence*, never claims certainty.

> **Implementation reference:** The V2.0 Bayesian confluence engine is
> documented in [confluence-engine.md](confluence-engine.md) — including
> the log-odds update function, evidence calibration, temporal decay
> formulas, signal hierarchy, and asset-class universality rules.

---

## 1. Philosophy & First Principles

### 1.1 Auction Market Theory

Every financial market is a continuous **two-way auction**. Buyers and sellers
meet at a price; transactions occur when their interests intersect. Every candle
on a chart records the result of one auction period:

| Candle Component | Auction Meaning |
|------------------|-----------------|
| **Open** | First transaction price — the market's opening consensus |
| **High** | Maximum price buyers were willing to pay — the auction's ceiling |
| **Low** | Minimum price sellers accepted — the auction's floor |
| **Close** | Last transaction price — the market's closing consensus |
| **Volume** | How many shares changed hands — the *conviction* behind the auction |

From this principle, every pattern, every indicator, every signal is a
manifestation of **supply/demand imbalance**:

- **Bullish** = demand exceeds supply at current prices → buyers must pay higher
- **Bearish** = supply exceeds demand at current prices → sellers must accept lower
- **Neutral** = supply and demand are in rough equilibrium → price consolidates

### 1.2 Probabilistic, Not Predictive

Candle AI does not predict the future. It estimates the **conditional
probability** that the balance of evidence favors one direction over the other,
given:

- The current market regime (trending, ranging, transitional)
- The price action structure (HH/HL or LH/LL sequences)
- The momentum profile (RSI, MACD)
- The pattern footprint (candlestick formations, chart structures)
- The volume conviction (participation behind moves)

Every output includes a **confidence tier** and a **risk assessment** because
edge is never certainty.

### 1.3 The Signal Philosophy

Signals are **evidence, not orders**. A bullish engulfing pattern at support
with rising volume is evidence of buying pressure. It is not a "buy now"
command.

The framework treats each signal as a piece of evidence that modifies the base
probability. No single signal — not even the strongest — is sufficient alone.
**Confluence** (multiple independent signals pointing the same direction) is the
core analytical principle.

---

## 2. Market Regime Classification

The market regime is the **first and most important filter**. The same signal
has fundamentally different meanings depending on the regime.

### 2.1 Regime Types

```
               ╔═══════════════════════════════╗
               ║    Market Regime Taxonomy      ║
               ╠═══════════════════╦═══════════╣
               ║                   ║            ║
        ┌──────▼──────┐    ┌──────▼──────┐    ┌▼─────────────┐
        │  Trending    │    │  Ranging     │    │ Transitional  │
        │  (Impulse)   │    │  (Mean       │    │  (Regime      │
        │              │    │   Reversion) │    │   Change)     │
        └──────┬───────┘    └──────┬───────┘    └┬──────────────┘
               │                   │              │
        ┌──────▼──────┐    ┌──────▼──────┐    ┌──▼──────────────┐
        │ Uptrend     │    │ Sideways     │    │ Trend→Range     │
        │ (Bull)      │    │ (Neutral)    │    │ Range→Trend     │
        │             │    │              │    │ Trend Reversal  │
        │ Buy dips    │    │ Fade edges   │    │ Wait for        │
        │             │    │              │    │ confirmation    │
        └──────┬──────┘    └──────────────┘    └─────────────────┘
               │
        ┌──────▼──────┐
        │ Downtrend   │
        │ (Bear)      │
        │             │
        │ Sell rallies │
        └─────────────┘
```

### 2.2 Regime Detection

| Method | Signal | Threshold |
|--------|--------|-----------|
| **SMA Alignment** | SMA 20 > 50 > 200 | Uptrend |
| **SMA Alignment** | SMA 20 < 50 < 200 | Downtrend |
| **SMA Alignment** | Crossed / interleaved | Ranging |
| **ADX** | ADX > 25 and rising | Trending |
| **ADX** | ADX < 20 | Ranging |
| **Market Structure** | Sequence of HH + HL | Uptrend |
| **Market Structure** | Sequence of LH + LL | Downtrend |
| **Market Structure** | Broken sequence | Transitional |

**Consensus rule**: At least 2 out of 3 methods must agree for the regime
classification to be considered reliable. When only 1 method signals, the
regime is `transitional` by default.

### 2.3 Regime-Dependent Signal Interpretation

| Signal | In Uptrend | In Ranging | In Downtrend |
|--------|-----------|-----------|-------------|
| Bullish Engulfing | Continuation (confirming) | Reversal (buy edge) | Counter-trend (weak) |
| Hammer | Pullback entry (strong) | Reversal (moderate) | Dead-cat bounce (weak) |
| RSI oversold (< 30) | Buy dip (strong) | Buy edge (moderate) | Continuation (bearish) |
| RSI overbought (> 70) | Pullback warning (weak) | Sell edge (moderate) | Sell rally (strong) |
| Bearish Engulfing | Counter-trend (weak) | Reversal (sell edge) | Continuation (confirming) |
| Shooting Star | Counter-trend (moderate) | Reversal (moderate) | Continuation entry (strong) |

This table illustrates why no signal has intrinsic meaning — **context is
everything**.

---

## 3. The Three Pillars of Analysis

### 3.1 Pillar 1: Price Action (Market Structure)

**Role**: Identify the structural direction of the auction. This has the
highest weight in the hierarchy because price is the final arbiter — everything
else is derivative.

| Element | What It Reveals |
|---------|-----------------|
| **Swing Highs / Lows** | Where the auction reversed direction |
| **HH/HL Sequence** | Uptrend confirmation (demand in control) |
| **LH/LL Sequence** | Downtrend confirmation (supply in control) |
| **Support / Resistance** | Price levels where imbalance shifted before |
| **Candlestick Patterns** | Micro-structure at potential reversal/continuation points |
| **Chart Patterns** | Macro-structure: larger-scale battle zones between supply/demand |

**Programming principle**: Price action analysis is **rule-based**, not learned.
Every pattern has objective recognition criteria (see `classical-patterns.md`).

### 3.2 Pillar 2: Momentum (Indicators)

**Role**: Measure the *rate of change* of the auction. Are buyers/sellers
accelerating or exhausting? Momentum confirms or diverges from price action.

| Indicator | What It Measures | Primary Use |
|-----------|-----------------|-------------|
| **RSI (14)** | Speed and change of price / overbought-oversold | Exhaustion detection, divergence |
| **MACD (12/26/9)** | Relationship between two EMAs | Trend changes, momentum shifts |
| **Bollinger Bands (20/2)** | Volatility relative to moving average | Squeeze/expansion, mean reversion |
| **SMAs (20/50/200)** | Smoothed price levels | Trend direction, dynamic S/R |
| **EMAs (9/21)** | Recent price emphasis | Short-term momentum, entries |

**Divergence** is the highest-value momentum signal:

```
  Price makes HH  →  Bullish
  RSI makes LH    →  Bearish divergence = WARNING

  Price makes LL  →  Bearish
  RSI makes HL    →  Bullish divergence = OPPORTUNITY
```

### 3.3 Pillar 3: Volume

**Role**: Validate or invalidate every price move. Volume is the **weight of
conviction** behind the auction. A pattern without volume is a pattern without
participants — unreliable.

| Volume Signal | Meaning |
|---------------|---------|
| **Rising volume + rising price** | Strong demand, trend likely to continue |
| **Rising volume + falling price** | Strong supply, trend likely to continue |
| **Falling volume + rising price** | Weak demand, trend may stall |
| **Falling volume + falling price** | Weak supply, selling pressure fading |
| **Volume climax** (extreme spike) | Capitulation — potential reversal |
| **Volume dry-up** (very low) | Indecision — precedes breakout |
| **Volume confirming a pattern** | Pattern reliability +1 grade |
| **Volume absent at a pattern** | Pattern reliability -1 grade |

**Programming note**: Volume is always relative to recent history. Compare to
20-period average volume, not absolute thresholds.

---

## 4. Signal Hierarchy & Conflict Resolution

### 4.1 The Hierarchy

Signals are not equal. When signals conflict, the hierarchy determines which
takes priority:

```
Level 1: MARKET STRUCTURE (HH/HL, LH/LL, S/R breaks)
         ↑ Overrides everything below
Level 2: CHART PATTERNS (Head & Shoulders, Triangles, Flags)
         ↑ Overrides indicators and candlestick patterns
Level 3: CANDLESTICK PATTERNS (Engulfing, Stars, Harami, etc.)
         ↑ Overrides indicators
Level 4: MOMENTUM INDICATORS (RSI divergences, MACD crosses)
         ↑ Overrides raw volume
Level 5: VOLUME
         ↑ Foundation — validates or invalidates all above
```

### 4.2 Conflict Resolution Rules

| Conflict | Resolution | Rationale |
|----------|-----------|-----------|
| Bullish pattern + bearish structure | Pattern is **weakened** (downgraded 1 tier) | Structure trumps micro pattern |
| Bullish pattern + bearish RSI divergence | Pattern is **suspect** (needs volume confirmation) | Divergence is a leading signal |
| Bullish RSI + bearish MACD | **Neutral** — wait for resolution | Neither has structural authority |
| Bullish chart pattern + bearish candlestick | Chart pattern **dominates** (candlestick is noise at this scale) | Higher time horizon wins |
| Bullish pattern + no volume | Pattern is **unconfirmed** (downgraded 1 grade) | Volume is the conviction validator |

### 4.3 Decision Tree (Simplified)

```
Is there a clear Market Structure?
├── YES → Is pattern aligned with structure?
│   ├── YES → Are momentum signals confirming?
│   │   ├── YES → Is volume confirming?
│   │   │   ├── YES → HIGH CONFIDENCE
│   │   │   └── NO  → MEDIUM CONFIDENCE (suspect on volume)
│   │   └── NO  → MEDIUM CONFIDENCE (momentum divergence)
│   └── NO  → LOW CONFIDENCE (counter-trend, needs structure shift)
└── NO  → Is there a chart pattern at boundary?
    ├── YES → MEDIUM CONFIDENCE (pattern anticipating structure shift)
    └── NO  → INCONCLUSIVE (no actionable evidence)
```

---

## 5. Confluence Scoring Model

This section defines the **technical specification** for the future client-side
scoring engine. It is not yet implemented.

### 5.1 Design Principle

**No weighted sums.** Weighted sums of indicators are brittle, opaque, and
impossible to calibrate without overfitting. Instead, the model uses
**conditional probability modification**: each confirming signal multiplies
confidence; each contradicting signal reduces it.

### 5.2 Base Rate

Every analysis starts from the **base rate** of the regime:

| Regime | Base Bullish Probability | Base Bearish Probability |
|--------|--------------------------|--------------------------|
| Strong Uptrend | 0.60 | 0.40 |
| Weak Uptrend | 0.55 | 0.45 |
| Ranging | 0.50 | 0.50 |
| Weak Downtrend | 0.45 | 0.55 |
| Strong Downtrend | 0.40 | 0.60 |
| Transitional | 0.50 | 0.50 |

These are **uninformed priors** — the probability before any signal evidence.

### 5.3 Evidence Modification Table

Each signal type modifies the probability toward its direction. The magnitude
depends on the signal's **reliability grade** and whether it aligns with the
regime:

| Signal Type | Grade | Regime-Aligned | Counter-Regime |
|-------------|-------|---------------|----------------|
| Market Structure shift | — | ±0.20 | ±0.20 |
| Chart Pattern completion | A | ±0.15 | ±0.08 |
| Chart Pattern completion | B | ±0.10 | ±0.05 |
| Candlestick Pattern | A | ±0.10 | ±0.03 |
| Candlestick Pattern | B | ±0.07 | ±0.02 |
| RSI Divergence | — | ±0.08 | ±0.05 |
| MACD Crossover | — | ±0.06 | ±0.03 |
| Volume Confirmation | — | ×1.2 multiplier | ×0.8 multiplier |
| Volume Absent | — | ×0.8 multiplier | ×0.7 multiplier |

### 5.4 Confidence Tier Calculation

```
After all evidence is applied:

  P(bullish) ≥ 0.75  →  HIGH confidence, bullish
  P(bullish) ≥ 0.60  →  MEDIUM confidence, bullish
  P(bullish) ≥ 0.50  →  LOW confidence, bullish bias
  P(bullish) = 0.50  →  NEUTRAL / inconclusive
  P(bullish) ≤ 0.40  →  LOW confidence, bearish bias
  P(bullish) ≤ 0.25  →  MEDIUM confidence, bearish
  P(bullish) ≤ 0.15  →  HIGH confidence, bearish
```

Probabilities are clamped to [0.05, 0.95] — never 0 or 1. There are no
certainties in markets.

### 5.5 Example Calculation

```
Regime: Strong Uptrend → P(bullish) = 0.60

Evidence applied:
  1. Bullish Engulfing (Grade A, regime-aligned) → +0.10 → 0.70
  2. RSI bullish divergence         → +0.08 → 0.78
  3. Volume confirmation            → ×1.2  → 0.936 → clamped to 0.95

Result: HIGH confidence, bullish
```

```
Regime: Ranging → P(bullish) = 0.50

Evidence applied:
  1. Hammer at support (Grade B, regime-aligned) → +0.07 → 0.57
  2. MACD bearish (contradicts)                  → -0.03 → 0.54
  3. Volume absent                                → ×0.7  → 0.378

Result: MEDIUM confidence, bearish
(volume absence penalized heavily — pattern not trusted)
```

---

## 6. Risk Integration

Risk management is not an add-on; it is an **output of the framework**. Every
analysis that reaches a confidence tier must include risk parameters.

### 6.1 Stop-Loss Placement

Stop-loss is derived from **market structure**, not arbitrary percentages:

| Regime | Stop-Loss Placement |
|--------|-------------------|
| Uptrend (long) | Below most recent **Higher Low** or below pattern low |
| Downtrend (short) | Above most recent **Lower High** or above pattern high |
| Ranging (long) | Below range support |
| Ranging (short) | Above range resistance |
| Transitional | Below/above the **last structural extreme** |

Minimum distance: **1.5 × ATR(14)** from entry. A stop closer than 1.5 ATR is
within noise range and likely to be triggered randomly.

### 6.2 Risk-Reward Requirement

The framework requires a **minimum risk-reward ratio of 1:2** for any HIGH
confidence signal, and **1:3** for MEDIUM confidence signals.

```
Target = Entry + (Entry - Stop) × MinRR

Example (Long):
  Entry:     $100
  Stop:      $97    (risk = $3)
  MinRR:     1:2
  Target:    $100 + ($3 × 2) = $106
```

If the structural resistance is closer than the minimum target, the setup is
**invalid regardless of signal strength** — the market structure doesn't support
enough reward for the risk.

### 6.3 Position Sizing

Position size is a function of risk tolerance, not conviction:

```
Position Size = (Account × Risk%) / (Entry - Stop)

Example:
  Account:   $10,000
  Risk%:     1% ($100 max loss)
  Entry:     $100
  Stop:      $97
  Position:  $100 / $3 = 33 shares
```

The framework outputs the suggested position size based on a configurable risk
percentage (default 1%). Users can override the percentage; the model computes
the rest.

---

## 7. Role of AI in the Framework

### 7.1 What the LLM Does

The LLM (Large Language Model) serves as a **qualitative synthesis layer** over
the quantitative framework:

- **Narrative generation**: Translating the confluence analysis into natural
  language summaries that explain *why* the evidence points a certain direction
- **Contextual nuance**: Qualitative factors the rules cannot capture (earnings
  events, sector rotation, macro context mentioned by the user)
- **Multi-timeframe synthesis**: Interpreting how the evidence on different
  timeframes relates (daily pattern within weekly structure)

### 7.2 What the LLM Does NOT Do

- **Generate the primary signal**: The quantitative framework produces the
  confidence tier and direction FIRST. The LLM explains it, not creates it.
- **Invent patterns**: The LLM receives patterns detected by rule-based
  detectors, not raw candles. It cannot hallucinate patterns.
- **Replace risk management**: Risk parameters (stop, target, size) are computed
  deterministically. The LLM never overrides them.
- **Override the hierarchy**: The LLM cannot "disagree" with the confluence
  model. If it does, the model's output takes precedence.

### 7.3 The Prompt Structure (Current Implementation)

The analysis service builds a system prompt and user prompt that includes:

- Market regime classification (SMA alignment)
- Indicator snapshots (last RSI, MACD, BB values)
- Detected patterns with confidence scores and sentiment
- The LLM is instructed to return structured JSON matching the
  `AnalysisResult` schema

The LLM interprets this data and provides:

- Trend analysis (direction + strength + description)
- Support/resistance levels
- Signal list with buy/sell/neutral interpretations
- Risk assessment
- Natural language summary

### 7.4 Future: AI as Analyst Augmenter

As the quantitative framework matures, the AI's role shifts from "primary
analyst" to "analyst augmenter":

```
Current:   Indicators + Patterns → LLM → Analysis
Future:    Indicators + Patterns → Quantitative Framework → Confidence Tier
                    ↓
              LLM synthesizes narrative + qualitative context
                    ↓
              Combined output: Quantitative signal + Narrative explanation
```

This separation ensures the analysis is **reproducible** (same inputs → same
confidence tier) while the narrative adapts to context.

---

## 8. Architectural Decision Records

ADRs 010–013 are recorded in [architecture.md](architecture.md) alongside
ADRs 001–009. They cover the design decisions behind pattern detection
(010), the confluence scoring model (011), the client-side analysis
commitment (012), and the scope definition of the project (013).

---

## 9. Implementation Plan

The implementation roadmap — past deliverables and future phases with their
motivations and dependencies — is documented in
[development-roadmap.md](development-roadmap.md).

---

## References

- Bulkowski, T. (2021). *Encyclopedia of Chart Patterns* (3rd ed.). Wiley.
- Nison, S. (2001). *Japanese Candlestick Charting Techniques* (2nd ed.). NYIF.
- Murphy, J. J. (1999). *Technical Analysis of the Financial Markets*. NYIF.
- Steidlmayer, J. P. & Hawkins, S. (1993). *Steidlmayer on Markets*. Wiley.
  (Auction Market Theory foundation)
- Kahneman, D. (2011). *Thinking, Fast and Slow*. Farrar, Straus and Giroux.
  (Probabilistic reasoning under uncertainty)
