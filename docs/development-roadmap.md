# Candle AI: Development Roadmap

## Purpose

This document records the complete development progression of Candle AI —
what was built, in what order, and why. It serves as:

- A historical record of the project's evolution
- A map of what comes next, organized by functional epics
- A single source of truth for implementation priorities

Past phases are documented from git history. Future phases are derived from
the analytical methodology in `analytical-framework.md`, the pattern catalogue
in `classical-patterns.md`, and the 2026 market adaptations in
`classical-patterns-2026.md`.

This is a solo-developer project. There are no sprints, no story points, no
team — just functional deliverables organized by logical dependency.

---

## Epic 1: Foundation ✅

**Goal**: Establish the application shell — charting, data flow, LLM
integration, and internationalization.

**Why first**: Nothing else can be built without a chart on screen, market
data flowing in, and an LLM pipeline to analyze it.

### Deliverables

- [x] Angular 22 project setup (standalone, Signals, zoneless)
- [x] Lightweight Charts v5 candlestick series with volume histogram
- [x] Ticker selector with watchlist and autocomplete
- [x] Multi-provider LLM client (OpenAI-compatible: Ollama, DeepSeek,
  OpenAI, Groq, Together AI)
- [x] Runtime i18n (EN/ES) via ngx-translate v18
- [x] prompt-forge agentic skills infrastructure
- [x] README with quick start, tech stack, and project structure

### Git History

| Commit | Message |
|--------|---------|
| `56e60cc` | feat: initial project setup with candlestick charts, ticker selector, multi-LLM provider, and i18n (en/es) |
| `de2c128` | chore: clean up README by removing redundant sections and maintaining i18n information |
| `dd00214` | Add new skills using prompt-forge repository for ngx-translate v18, PowerShell patterns, skill creation, and token tracking |

### Motivation

Before any analysis can happen, the application needs three things: a chart
to display data, a way to fetch data, and an AI to interpret it. These three
pillars are built simultaneously because they are independently testable but
collectively form the minimum viable product.

---

## Epic 2: Core Analysis Engine ✅

**Goal**: Add technical indicators calculated off the main thread, rule-based
candlestick pattern detection, and an AI analysis dashboard.

**Why second**: Indicators and patterns are the raw material of analysis.
Without them, the LLM has nothing to analyze.

### Deliverables

- [x] Web Worker for indicator computation (RSI, MACD, Bollinger Bands,
  SMA 20/50/200, EMA 9/21, Volume Profile)
- [x] Indicator panel with toggle controls and chart overlays
- [x] Rule-based candlestick pattern detection (11 patterns: Doji, Hammer,
  Shooting Star, Bullish/Bearish Engulfing, Morning/Evening Star,
  Bullish/Bearish Harami, Three White Soldiers, Three Black Crows)
- [x] Pattern overlay with per-type visibility selection modal
- [x] Pattern markers on chart via `createSeriesMarkers()`
- [x] Analysis dashboard displaying LLM output: Trend, Key Levels, Signals,
  Risk, Summary
- [x] Candle model with Yahoo Finance parser and mock data fallback
- [x] IndexedDB cache with 1-hour TTL (Dexie.js)

### Git History

| Commit | Message |
|--------|---------|
| `e8aef45` | feat: add technical indicators panel and calculations |
| `c2ddf33` | feat: implement candlestick pattern detection and overlay display |
| `997450c` | feat: enhance analysis dashboard with new features and styling |

### Motivation

Indicators run in a Web Worker because the main thread must stay responsive
for chart interaction. Pattern detection is rule-based rather than ML-based
because transparency is paramount — every detection must be explainable
(see ADR-010). The analysis dashboard is the first consumer of both data
streams, proving the pipeline works end-to-end.

---

## Epic 3: Export & UX Polish ✅

**Goal**: Let users export their analysis to TradingView and improve the
application's visual and interactive quality.

**Why third**: The core pipeline works. Now make it portable (Pine Script)
and pleasant to use (theming, loading states).

### Deliverables

- [x] Pine Script v5 code generation from active indicators and patterns
- [x] Copy-to-clipboard, file download, and TradingView deep link
- [x] Dark/light theme toggle with CSS custom properties
- [x] Theme preference persistence in localStorage
- [x] Loading states and empty-state placeholders across all components

### Git History

| Commit | Message |
|--------|---------|
| `c4a9b58` | feat: add export panel for Pine Script generation and download functionality |
| `c15ae24` | feat: add theme toggle and loading states to app |

### Motivation

Pine Script export is a differentiator — no other client-side analysis tool
generates ready-to-use TradingView code. Theming is essential for a dashboard
that may be used for hours at a time; dark mode reduces eye strain. Loading
states prevent the UI from appearing broken during async operations.

---

## Epic 4: Infrastructure Hardening ✅

**Goal**: Improve data resilience, state management, LLM reliability, and
accessibility.

**Why fourth**: The happy path works. Now handle edge cases — cache misses,
LLM failures, keyboard navigation, screen readers.

### Deliverables

- [x] Enhanced cache store with TTL enforcement and purge-on-startup
- [x] Ticker store signal-based state with reset-on-ticker-change
- [x] LLM provider improvements: reasoning model handling,
  `response_format` detection for local endpoints, fallback JSON parsing
- [x] Architecture documentation with 13 ADRs
- [x] Accessibility improvements: ARIA labels, keyboard navigation,
  focus management across all components
- [x] UI refinements across pattern overlay and ticker selector

### Git History

| Commit | Message |
|--------|---------|
| `e549d5a` | feat: update documentation and improve LLM provider handling |
| `8af07a2` | feat: enhance cache store and ticker store functionality |
| `8649d03` | feat: Enhance accessibility and UI improvements across pattern overlay and ticker selector |

### Motivation

Infrastructure hardening is deliberately deferred until after the feature set
stabilizes. Hardening too early means hardening the wrong things. By Epic 4,
the architecture is well-understood, and the ADRs capture the "why" behind
every decision for future contributors.

---

## Epic 5: Analytical Knowledge Base ✅

**Goal**: Establish the theoretical and practical foundation for all future
analysis features. Define what patterns exist, how they behave in 2026
markets, and how the confluence model will score them.

**Why now**: Before implementing any new detection or scoring, the methodology
must be defined. This is the "measure twice, cut once" phase.

### Deliverables

- [x] `docs/analytical-framework.md` — Market regime classification,
  three-pillar signal hierarchy (Price Action → Momentum → Volume),
  probabilistic confluence model specification, risk integration,
  AI role definition
- [x] `docs/classical-patterns.md` — 30+ patterns catalogued with:
  recognition criteria, market psychology, statistical edge (Bulkowski),
  regime dependency, volume confirmation, reliability grading (A/B/C/D),
  pattern combination matrix, quality grading system
- [x] `docs/classical-patterns-2026.md` — Modern market adaptations:
  algorithmic degradation data (Flags −57%, Pennants −60%), volume
  reinterpretation (dark pools, fragmentation), crypto-specific rules,
  0DTE gamma effects, passive flow structural bid, adjusted confluence
  weights
- [x] `docs/development-roadmap.md` — This document
- [x] `docs/architecture.md` updated with ADRs 010-013 (pattern detection
  methodology, confluence model, client-side commitment, scope definition)
- [x] `README.md` updated with all documentation references

### Motivation

The existing 11-pattern detection and LLM-based analysis work but are
"version 0" of the analytical engine. The knowledge base documents define
"version 1" — a systematic framework where every signal has a statistical
foundation, every pattern is graded by objective criteria, and the confluence
model is probabilistic rather than a black-box LLM interpretation.

This epic produces zero code changes. It produces the blueprint against which
all future code will be measured.

---

## Epic 6: Quantitative Foundation ✅

**Goal**: Implement the analytical infrastructure that the knowledge base
defines — market regime detection, chart pattern recognition, volume analysis,
and pattern quality grading.

**Why next**: The LLM-only analysis pipeline is a black box. Before building
the confluence engine, the raw inputs must be enriched with structural
analysis (regime, chart patterns, volume signals) and each pattern must carry
a quality grade.

### Deliverables

- [x] Market regime detection (SMA alignment + ADX + market structure)
  - Three-method consensus: SMA 20/50/200 alignment, ADX threshold, HH/HL
    vs LH/LL sequence
  - Output: `RegimeClassification` (Strong Uptrend, Weak Uptrend, Ranging,
    Weak Downtrend, Strong Downtrend, Transitional)
- [x] Chart pattern detection — Priority order from 2026 adaptations:
  1. Head & Shoulders / Inverse H&S (daily/weekly) — still the gold standard
  2. Double Top / Double Bottom (daily, 15+ candle minimum separation)
  3. Bump & Run Reversal — actually improved over decades
  4. Rounding Bottom / Top
  5. Cup & Handle
- [x] Volume profile analysis
  - Volume Climax detection (≥ 250% of 20-period average)
  - Volume Dry-Up detection (≤ 50% of average)
  - Volume Divergence (price vs volume direction mismatch)
- [x] Pattern quality grading engine (A/B/C/D)
  - Universal criteria: volume confirmation, S/R proximity, trend alignment,
    body-to-range ratio, prior trend length, next-candle confirmation
  - Deterministic scoring function (see `classical-patterns.md` Section 9.3)

### Dependencies

- Epic 5 (knowledge base defines what to build)
- Epic 2 (existing pattern detection infrastructure can be extended)
- Epic 2 (Web Worker pattern can be reused for chart pattern computation)

### Motivation

Chart patterns are prioritized by 2026 reliability, not by implementation
difficulty. Head & Shoulders is complex to detect but is the most reliable
pattern in modern markets. Double Top/Bottom with 15+ candle separation is
prioritized over Triangles and Flags because the latter have degraded to
near-statistical-noise levels (see 2026 adaptations).

Volume analysis is a prerequisite for pattern grading — a Grade A pattern
requires volume confirmation, and volume confirmation requires volume
pattern detection.

---

## Epic 7: Confluence Engine �

**Goal**: Replace the LLM-only analysis pipeline with a deterministic
probabilistic scoring model that produces confidence tiers without AI
dependency. The LLM becomes an augmenter, not the primary analyst.

**Why after Epic 6**: The confluence model requires graded patterns, regime
classification, and volume signals as inputs. All of those are built in
Epic 6.

### Deliverables

- [x] Probabilistic scoring model implementation
  - Base rate from regime classification
  - Evidence modification per `classical-patterns-2026.md` Section 8
  - Confidence tier calculation (HIGH ≥ 0.75, MEDIUM ≥ 0.60, LOW ≥ 0.50)
- [x] Signal hierarchy and conflict resolution engine
  - Five-level hierarchy: Market Structure → Chart Patterns → Candlestick
    Patterns → Momentum Indicators → Volume
  - Conflict resolution rules (see `analytical-framework.md` Section 4.2)
- [x] Risk parameter computation
  - Stop-loss placement derived from market structure (not arbitrary %)
  - Minimum risk-reward ratio enforcement (1:2 HIGH, 1:3 MEDIUM)
  - Position sizing formula: (Account × Risk%) / (Entry − Stop)
- [x] Offline analysis mode — confidence tier output without LLM
  - Works entirely client-side with zero network requests
  - Serves as fallback when LLM is unavailable
- [x] 2026 market overrides
  - Passive Flow Override: ×1.1 bullish / ×0.9 bearish for mega-caps/ETFs
  - 0DTE Gamma Override: downgrade intraday patterns one tier on M/W/F

### Dependencies

- Epic 6 (inputs: regime, graded patterns, volume signals)
- Epic 5 (specification in `analytical-framework.md` Section 5)

### Motivation

The current architecture routes all analysis through the LLM. This works but
has three flaws:

1. **Reproducibility**: The same inputs can produce different LLM outputs
2. **Dependency**: Without an LLM configured, there is no analysis at all
3. **Opacity**: The LLM's reasoning chain is not inspectable

The confluence engine fixes all three: deterministic scoring, offline-capable,
and fully traceable (each confidence tier can be decomposed into which signals
contributed how much). The LLM's role shifts from "primary analyst" to
"qualitative synthesizer" — it explains the confluence output, it does not
create it.

---

## Epic 8: AI Augmentation 🔮

**Goal**: Reposition the LLM as a narrative layer over the quantitative
engine. Enable multi-timeframe synthesis and interactive analysis.

**Why last**: The LLM adds the most value when the quantitative foundation
is complete. Giving the LLM raw data and asking it to do everything is the
current approach. Giving the LLM a confidence tier plus contributing signals
and asking it to explain the story is the target.

### Deliverables

- [ ] LLM prompt restructuring
  - Input: confidence tier + contributing signals + regime + risk parameters
    (not raw indicator values and pattern names)
  - Output: natural language narrative explaining *which* evidence drove
    the conclusion and *why*
- [ ] Multi-timeframe synthesis
  - Daily pattern within weekly structure
  - Weekly trend context for daily signals
  - "The daily Hammer is a pullback entry within a weekly uptrend" vs
    "The daily Hammer is a dead-cat bounce in a weekly downtrend"
- [ ] Interactive follow-up questions
  - User can ask the LLM about specific aspects of the analysis
  - "Why is this signal only MEDIUM confidence?"
  - "What would upgrade this to HIGH?"
- [ ] Analysis history and comparison
  - Store past analyses for the same ticker
  - Compare current analysis to previous (regime change? signal shift?)

### Dependencies

- Epic 7 (confidence tiers and contributing signals must exist first)
- Epic 6 (multi-timeframe requires regime on multiple timeframes)

### Motivation

The LLM is not being removed — it is being repositioned. A quantitative
engine computes the *what* (direction, confidence, risk). The LLM provides
the *why* (narrative, context, nuance). This separation makes the analysis
both reproducible (same inputs → same confidence) and interpretable (natural
language explanation of the quantitative output).

---

## Summary: Past → Future

| Epic | Status | What |
|------|--------|------|
| 1. Foundation | ✅ | Chart, data, LLM, i18n |
| 2. Core Analysis | ✅ | Indicators, patterns, dashboard |
| 3. Export & UX | ✅ | Pine Script, theming, loading |
| 4. Infrastructure | ✅ | Cache, state, LLM hardening, a11y |
| 5. Knowledge Base | ✅ | Framework, patterns, 2026 adaptations |
| 6. Quantitative Foundation | ✅ | Regime, chart patterns, volume, grading |
| 7. Confluence Engine | ✅ | Probabilistic scoring, signal hierarchy, risk |
| 8. AI Augmentation | ✅ | Narrative LLM, multi-TF, follow-up chat, history |

### Dependency Chain

```
Epic 1 → Epic 2 → Epic 3 → Epic 4
                              ↓
                         Epic 5 (docs, no code)
                              ↓
                         Epic 6 (quant foundation)
                              ↓
                         Epic 7 (confluence engine)
                              ↓
                         Epic 8 (AI augmentation)
```

### Design Principle

Each epic is self-contained: it has a clear goal, delivers independently
testable functionality, and does not depend on partial completion of later
epics. This is the same principle that produced the current codebase — every
commit is a working state — applied to the remaining work.

---

## Technical Feasibility Assessment

Audited 2026-06-25 against: Angular 22 (standalone, Signals, zoneless),
Lightweight Charts v5, Yahoo Finance free API (proxied via /api/yahoo), LLM provider
(OpenAI-compatible), Dexie.js (IndexedDB), Web Workers.

### Epic 6: Quantitative Foundation

| Deliverable | Verdict | Notes |
|------------|---------|-------|
| Market regime detection | ✅ Feasible | Pure computation on existing candle data. SMA alignment already in the worker. ADX is a new indicator (simple). HH/HL detection is a pure function. |
| Chart pattern detection | ⚠️ Feasible, high complexity | Double Top/Bottom: moderate. Head & Shoulders: **high complexity** — Bulkowski cites qualitative criteria ("should look proportional, not lopsided"). Expect false positives in v1. Bump & Run, Rounding, Cup & Handle: even more subjective. **Mitigation**: start with Double Top/Bottom as proof of concept. Defer Cup & Handle and Rounding to a second iteration. |
| Volume analysis | ✅ Feasible | Yahoo Finance provides volume in OHLCV. Climax (≥250% avg), Dry-Up (≤50% avg), Divergence: pure functions. **Caveat**: visible volume is only ~40-50% of total market activity (`classical-patterns-2026.md`). This is a market reality, not a technical blocker. |
| Pattern quality grading | ✅ Feasible | Pure computation on detected patterns + candle data. Requires S/R level detection (new, algorithmic). Processes at most a few dozen patterns — synchronous execution is fine. |

**Blocking issues**: None. All computation is client-side with zero new API
dependencies.

### Epic 7: Confluence Engine

| Deliverable | Verdict | Notes |
|------------|---------|-------|
| Probabilistic scoring model | ✅ Feasible | Pure arithmetic. Synchronous. No dependencies. |
| Signal hierarchy & conflict resolution | ✅ Feasible | Decision tree / rule engine. Pure logic. |
| Risk parameter computation | ✅ Feasible | Stop-loss from market structure (Epic 6 output). ATR(14) added to the worker (simple). Position sizing: pure arithmetic. |
| Offline analysis mode | ✅ Feasible | All computation is already client-side. The LLM call is the only external request — removing it makes analysis fully offline. Narrative becomes a templated signal breakdown instead of LLM text. |
| Passive Flow Override | ⚠️ Needs mitigation | Requires market cap to identify mega-caps (>$200B). The Yahoo Finance **chart** API returns OHLCV — no fundamental data. **Mitigation**: maintain a hardcoded list of known mega-caps and major ETFs (`AAPL`, `MSFT`, `NVDA`, `SPY`, `QQQ`, `IWM`, etc.) with a user-editable setting to add more. No new API calls needed. |
| 0DTE Gamma Override | ✅ Feasible | `Date.getDay()` + pattern timeframe check. Trivial. |

**Blocking issues**: None. Passive Flow Override is resolved without external
APIs via a hardcoded ticker list.

### Epic 8: AI Augmentation

| Deliverable | Verdict | Notes |
|------------|---------|-------|
| LLM prompt restructuring | ✅ Feasible | Pure prompt engineering. Changes what `buildUserPrompt()` produces. No infrastructure changes. |
| Multi-timeframe synthesis | ⚠️ Feasible, adds latency | Requires parallel fetches (1d + 1wk). Yahoo Finance supports this natively via the `interval` parameter. The cache already handles multi-key lookups. **Impact**: two fetches instead of one. **Mitigation**: fetch both timeframes in parallel; if weekly fetch fails, degrade gracefully to single-timeframe mode (Principle 4: Progressive Enhancement). |
| Interactive follow-up questions | ⚠️ Feasible, small refactor | The OpenAI protocol supports multi-turn via `messages[]` array. `LlmMessage` interface already supports multi-role. Current `LlmProvider.complete()` only accepts two strings. **Required**: add `completeMultiTurn(messages: LlmMessage[])` — a ~15-line addition that sends the full conversation history. Enforce a max of 10 messages to avoid token limit issues with smaller local models. |
| Analysis history & comparison | ✅ Feasible | Dexie.js is configured. Add an `analysisHistory` table keyed by `ticker + timestamp`. Query by ticker to populate a history view. |

**Blocking issues**: None critical. The provider refactor is minimal.

### Dependency Chain Validation

```
Epic 6 ──→ Epic 7 ──→ Epic 8
  │          │          │
  │          │          └── Needs multi-turn LLM (minor refactor, ~15 lines)
  │          └── Needs Passive Flow Override data (hardcoded list → zero new APIs)
  └── Chart patterns are algorithmically hard (start simple, iterate)
```

### Verdict

**All three epics are technically viable with the current stack.** No paid
external APIs are required. No architecture changes are needed. The zero-backend
principle holds. Every identified constraint has a concrete mitigation that
preserves the existing stack.
