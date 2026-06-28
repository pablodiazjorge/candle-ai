# Candle AI — Trading Analysis Dashboard

**Confluence-powered technical analysis. Optional AI narration.**
Local-first. Zero backend. Runs in your browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with prompt-forge](https://img.shields.io/badge/built%20with-prompt--forge-6e5de7.svg)](https://github.com/pablodiazjorge/prompt-forge)

---

## How It Works

Candle AI has a **two-layer architecture**:

| Layer | What | Requires |
|-------|------|----------|
| **Confluence Engine** (always on) | Bayesian probabilistic scoring across 5 signal hierarchies. Detects 15 pattern types, market structure (SMC), volume context, and regime. Produces a confidence tier: `HIGH` / `MEDIUM` / `LOW` / `NEUTRAL`. | Nothing — runs locally, zero config |
| **AI Narrative** (optional) | Natural language explanation of the confluence result. Answers "why is this signal HIGH confidence?" | Ollama (local) or cloud LLM provider |

The Confluence Engine is the brain. The LLM is the narrator — it explains
the output, never overrides it.

---

## Why Candle AI Exists

Financial analysis tools fall into two camps: expensive platforms (Bloomberg
Terminal, TradingView Premium) that lock you into their ecosystem, or open-source
libraries (TA-Lib, pandas) that require programming expertise to get a chart on
screen.

Candle AI is the middle ground. It renders professional-grade candlestick charts
with technical indicators, runs a deterministic confluence engine that scores
patterns using Bayesian probability, and optionally generates natural language
analysis via an LLM — all running locally in your browser. No accounts,
no subscriptions, no data leaving your machine. The core analysis works
immediately with zero configuration.

The architecture is designed around five principles:

| Principle | Implication |
|-----------|-------------|
| Zero backend | Everything runs in the browser. No server, no database, no API middleware |
| Non-blocking UI | Indicator calculations run in Web Workers; the chart stays responsive |
| Reactive by default | Angular Signals replace RxJS; zoneless change detection |
| Progressive enhancement | Falls back to synthetic data if Yahoo Finance is unreachable, works without LLM, degrades gracefully |
| Local-first | Default LLM is Ollama on your hardware; cloud providers are optional |

For the full rationale behind every architectural decision, see
[docs/architecture.md](docs/architecture.md).

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Angular 22 (standalone, Signals, zoneless) | Application shell and reactivity |
| Charting | Lightweight Charts v5 (TradingView) | Candlestick series, indicators, volume, pattern markers |
| Computation | Web Workers | RSI, MACD, Bollinger Bands, SMA, EMA off main thread |
| AI Analysis | OpenAI-compatible (Ollama, DeepSeek, OpenAI, Groq…) | Natural language market analysis |
| Caching | Dexie.js (IndexedDB) | 1-hour TTL for market data |
| Styling | Tailwind CSS 4 + CSS Custom Properties | Dark/light theme, responsive |
| i18n | ngx-translate v18 | Runtime language switching (EN/ES) |
| Testing | Vitest + jsdom | 160 tests (10 files), sub-second startup |

---

## Quick Start

```bash
# Requires Node ≥22.22.3
nvm use 22.22.3
npm install
ng serve
```

Open `http://localhost:4200`. Select a ticker from the watchlist, enable an
indicator, and click "Run Analysis".

For AI analysis, you have two options:

**Option A — Cloud (production, zero setup):** Select DeepSeek, OpenAI, or
Groq in ⚙️ → Settings and paste your API key. Cloud calls are proxied through
Vercel's Edge Function at `/api/llm/*` to bypass CORS restrictions.

**Option B — Local (development, private):** Install [Ollama](https://ollama.com)
and pull a model:

```bash
# Windows: set CORS first — $env:OLLAMA_ORIGINS = "*"
ollama pull llama3.1:8b   # Best for 12+ GB VRAM (RTX 3060/4060/4070)
```

On localhost, the default preset points to `http://localhost:11434/v1` with
`llama3.1:8b`. In production, the default is DeepSeek — local providers
won't work remotely unless you expose Ollama via a tunnel (ngrok) or set
`OLLAMA_ORIGINS=*` for direct browser access. Click ⚙️ → Test Connection
in either environment to verify.

---

## Project Structure

```
src/app/
├── core/
│   ├── models/          # Candle, Indicator, Pattern, Analysis, Confluence
│   ├── services/        # market-data, indicators, patterns, grading, confluence, analysis, market-context, pine-script
│   ├── workers/         # Web Worker (RSI, MACD, BB, ADX, regime, volume)
│   ├── llm/             # Multi-provider LLM client (OpenAI-compatible)
│   └── state/           # Signal-based stores (ticker, cache, LLM settings)
├── features/
│   ├── ticker-selector/ # Symbol search with autocomplete + watchlist
│   ├── candle-chart/    # Lightweight Charts with candlestick series
│   ├── indicator-panel/ # Toggles: RSI, MACD, BB, EMA, SMA, Volume Profile
│   ├── pattern-overlay/ # Pattern list with per-type chart marker selection modal
│   ├── analysis-dashboard/ # AI analysis: Trend, Levels, Signals, Risk, Summary
│   ├── llm-settings/    # Provider configuration panel
│   └── export-panel/    # Pine Script v5 code generation + TradingView deep link
└── shared/
```

---

## Features

### Market Data

Fetches OHLCV candles from Yahoo Finance via `/api/yahoo/v8/finance/chart/{symbol}`
(proxied through the Angular dev server in development; Vercel rewrites in production).
Caches results in IndexedDB with a 1-hour TTL. Falls back to per-ticker
synthetic data when Yahoo Finance is unreachable.

Weekly timeframe data is loaded in the background and scored independently by the
Confluence Engine. The weekly result appears as a context badge in the analysis
dashboard — no separate chart needed.

### Technical Indicators (Web Worker)

All calculations run off the main thread:

| Indicator | Parameters | Display |
|-----------|-----------|---------|
| RSI | 14 periods | Line chart with 70/30 overbought/oversold lines |
| MACD | 12, 26, 9 | Histogram + signal line |
| Bollinger Bands | 20, 2 | Upper/middle/lower bands with fill |
| SMA | 20, 50, 200 | Overlay lines |
| EMA | 9, 21 | Overlay lines |
| ADX | 14 periods | Trend strength (feeds regime detection) |
| Volume Profile | Auto | POC + Value Area |
| Volume Climax | 250% threshold | Extreme volume spikes |
| Volume Dry-Up | 50% threshold | Unusually low volume |
| Volume Divergence | Auto | Price vs volume direction mismatch |

### Pattern Detection

15 patterns detected via rule-based analysis (no external library).
Each pattern receives a quality grade (A-D) from the `GradingService`
using 6 objective criteria. A selection modal (📍) controls chart markers.

**Candlestick Patterns (11)**

| Sentiment | Patterns |
|-----------|----------|
| 🟢 Bullish | Hammer, Bullish Engulfing, Morning Star, Bullish Harami, Three White Soldiers |
| 🔴 Bearish | Shooting Star, Bearish Engulfing, Evening Star, Bearish Harami, Three Black Crows |
| 🟡 Neutral | Doji |

**Chart Patterns (4)**

| Sentiment | Patterns |
|-----------|----------|
| 🟢 Bullish | Double Bottom, Inverse Head & Shoulders |
| 🔴 Bearish | Double Top, Head & Shoulders |

### Confluence Engine (Epic 7 → Epic 9 — V2.0 Bayesian)

A **deterministic probabilistic scoring model** that runs entirely
client-side — no LLM required. Provides confidence tiers:
`HIGH` / `MEDIUM` / `LOW` / `NEUTRAL`.

- **Log-odds Bayesian update** with ±2.0 cap — replaces arithmetic `p += 0.10`
- **Grade-weighted impact** — A=1.0×, B=0.6×, C=0.3×, D=0.1× (no more C/D flattening)
- **Volatility-adjusted temporal decay** — `exp(−λt)`, adapts per timeframe
- **Proximity clustering** — merges similar patterns ≤3 candles apart
- **SMC detection** — BOS, CHoCH, Liquidity Sweep from market structure
- **Directional volume context** — buy_climax vs sell_climax with regime context
- **ATR-adaptive risk** — stop-loss and R:R adapt to volatility percentile
- **Cross-asset market context** — VIX, DXY correlation, forex structural inverse
- **Asset-universal thresholds** — 0DTE gated to US options, adaptive trend detection
- **100% traceable**: expand the signals list to see exact per-signal contributions

### AI Analysis (LLM — Narrative Layer)

The LLM acts as a **qualitative explainer** over the confluence output:
- Receives confidence tier + contributing signals + regime + patterns
- Returns structured JSON: **Trend**, **Key Levels**, **Signals**, **Risk**, **Summary**
- The LLM cannot override the confluence tier; it explains it

### Pine Script v5 Export

Generates a `.pine` indicator script from the active chart state. Includes
`plot()` calls for all active indicators, pattern annotations as comments, and
instructions for pasting into TradingView's Pine Editor. One-click copy,
download, and TradingView deep link.

### Dark/Light Theme

CSS custom properties with `data-theme` attribute. Preference persists in
`localStorage`. 28 color tokens defined for both themes.

---

## LLM Configuration

Click the ⚙️ button in the top bar. **Default: Ollama (local)** — no API keys,
no data leaves your machine.

| Provider | Base URL | API Key |
|---|---|---|
| **Ollama (local)** ★ | `http://localhost:11434/v1` | `ollama` |
| llama.cpp (local) | `http://localhost:8080/v1` | `not-needed` |
| DeepSeek | `https://api.deepseek.com/v1` | Your API key |
| OpenAI | `https://api.openai.com/v1` | Your API key |
| Groq | `https://api.groq.com/openai/v1` | Your API key |
| Together AI | `https://api.together.xyz/v1` | Your API key |
| Custom | Any OpenAI-compatible endpoint | — |

### ⚠️ CRITICAL: Avoid reasoning models

**This applies to ALL providers — local AND cloud.** Reasoning models output
chain-of-thought that cannot be parsed as JSON:

| ❌ Avoid | ✅ Use instead |
|---|---|
| `qwen3`, `qwq` | `llama3.1`, `llama3.2`, `qwen2.5` |
| `deepseek-reasoner`, `deepseek-r1` | `deepseek-chat` (V3) |
| `o1`, `o3`, `o1-mini` | `gpt-4o`, `gpt-4o-mini` |
| `claude-opus-4-thinking` | `claude-3.5-sonnet` |
| `gemini-2.5-pro-thinking` | `gemini-2.5-pro` |

### VRAM Guide (local models)

| VRAM | Recommended Model | Size |
|------|------------------|------|
| 6 GB | `llama3.2:3b` | 2.0 GB |
| 8 GB | `llama3.1:8b` (Q4) | 4.9 GB |
| 12 GB | `llama3.1:8b`, `mistral-nemo:12b` | 4.9–7.5 GB |
| 16 GB | `phi3:14b`, `qwen2.5:14b` | 8.5 GB |
| 24 GB | `qwen2.5:32b` | 19 GB |

---

## Data Flow

```
User selects ticker
  → TickerStore.selectTicker()
  → effect() triggers loadMarketData()
    → CacheStore.get() (IndexedDB, 1h TTL)
    → MarketDataService.fetchCandles() (Yahoo Finance via proxy → synthetic fallback)
    → TickerStore.setCandleData()
  → IndicatorsService.computeIndicators() (Web Worker)
    → TickerStore.setIndicators()
  → PatternsService.detectAll() + detectChartPatterns()
    → GradingService.gradeAll() → TickerStore.setPatterns()
  → ConfluenceService.score() → TickerStore.setConfluence()
  → MarketContextService.loadContext() → TickerStore.setMarketContext()
  → Confluence result shown immediately (no LLM needed)
  → User clicks "Run Analysis" (optional LLM narrative)
    → AnalysisService.runAnalysis()
      → LlmProvider.complete(systemPrompt, userPrompt)
        → (production) /api/llm/chat/completions → Vercel proxy → LLM API
        → (localhost) direct fetch to LLM endpoint
      → parseResponse() → TickerStore.setAnalysis()
```

---

## Build

```bash
ng build --configuration production
# Output: dist/candle-ai/
```

## Tests

```bash
npm run test:unit          # Vitest (160 tests)
npm run test:unit:watch    # Watch mode
npm run test:coverage      # With coverage report
```

---

## Agentic Workflow

This project uses [prompt-forge](https://github.com/pablodiazjorge/prompt-forge), a personal agentic skills infrastructure, to guide the AI coding agent during development. Six skills (`git-workflow`, `explore-codebase`, `powershell-patterns`, `auto-improve`, `skill-creator`, `track-tokens`) enforce Conventional Commits, efficient codebase exploration, Windows shell best practices, and cross-session learning.

The `.github/skills/` directory and `.github/instructions/default.instructions.md` are powered by prompt-forge — a drop-in toolkit that adds agent skills, an auto-improvement loop, and session tracking to any project. Zero dependencies, no build step, no backend.

---

## Documentation

- [docs/architecture.md](docs/architecture.md) — Full architectural decision record (16 ADRs, system context, confluence engine, data flow, security)
- [docs/analytical-framework.md](docs/analytical-framework.md) — Analysis methodology: market regime classification, three-pillar signal hierarchy, probabilistic confluence model, risk integration, AI role
- [docs/confluence-engine.md](docs/confluence-engine.md) — V1 → V2 evolution: Bayesian update, temporal decay, clustering, SMC, volume context, adaptive risk, market context
- [docs/classical-patterns.md](docs/classical-patterns.md) — Canonical reference for 30+ technical analysis patterns: recognition criteria, market psychology, statistical edge, reliability grading, combination matrix
- [docs/classical-patterns-2026.md](docs/classical-patterns-2026.md) — Modern market adaptations: how algo trading, 0DTE options, passive flows, and market fragmentation change pattern reliability in 2026
- [docs/development-roadmap.md](docs/development-roadmap.md) — Complete development progression: 9 completed epics
- [prompt-forge](https://github.com/pablodiazjorge/prompt-forge) — Agentic skills infrastructure used in this project

---

## License

This project's code is licensed under the [MIT License](LICENSE).