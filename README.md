# Candle AI — Trading Analysis Dashboard

A client-side technical analysis application with AI-powered market insights.
Local-first. Zero backend. Runs in your browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Why Candle AI Exists

Financial analysis tools fall into two camps: expensive platforms (Bloomberg
Terminal, TradingView Premium) that lock you into their ecosystem, or open-source
libraries (TA-Lib, pandas) that require programming expertise to get a chart on
screen.

Candle AI is the middle ground. It renders professional-grade candlestick charts
with technical indicators, detects candlestick patterns, and generates natural
language analysis via an LLM — all running locally in your browser. No accounts,
no subscriptions, no data leaving your machine unless you explicitly configure a
cloud LLM provider.

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
| Testing | Vitest + jsdom | 42 unit tests, sub-second startup |

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

For AI analysis, install [Ollama](https://ollama.com) and pull a model:

```bash
ollama pull llama3.1:8b   # Best for 12+ GB VRAM (RTX 3060/4060/4070)
```

The default preset already points to `http://localhost:11434/v1` with
`llama3.1:8b`. Click ⚙️ → Test Connection to verify.

---

## Project Structure

```
src/app/
├── core/
│   ├── models/          # Candle, Indicator, Pattern, Analysis, Confluence
│   ├── services/        # market-data, indicators, patterns, grading, confluence, analysis, pine-script
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
    └── components/      # Reusable UI primitives
```

---

## Features

### Market Data

Fetches OHLCV candles from Yahoo Finance via `/api/yahoo/v8/finance/chart/{symbol}`
(proxied through the Angular dev server in development; Vercel rewrites in production).
Caches results in IndexedDB with a 1-hour TTL. Falls back to per-ticker
synthetic data when Yahoo Finance is unreachable.

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

### Confluence Engine (Epic 7 — Offline-First)

A **deterministic probabilistic scoring model** that runs entirely
client-side — no LLM required. Provides confidence tiers:
`HIGH` / `MEDIUM` / `LOW` / `NEUTRAL`.

- **Base rate** from market regime (Strong Uptrend → Ranging → Strong Downtrend)
- **Evidence modification** from graded patterns (A/B), RSI divergence, MACD crossover
- **Volume multiplier** (×1.2 confirm, ×0.7 contradict)
- **2026 overrides**: passive flow ×1.1 (mega-caps), 0DTE gamma neutralization (M/W/F)
- **Risk parameters**: stop-loss from market structure, R:R enforcement (1:2 HIGH, 1:3 MEDIUM), position sizing
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
  → Confluence result shown immediately (no LLM needed)
  → User clicks "Run Analysis" (optional LLM narrative)
    → AnalysisService.runAnalysis()
      → LlmProvider.complete(systemPrompt, userPrompt)
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
npm run test:unit          # Vitest (87 tests)
npm run test:unit:watch    # Watch mode
npm run test:coverage      # With coverage report
```

---

## Agentic Workflow

This project uses [prompt-forge](https://github.com/pablodiazjorge/prompt-forge), a personal agentic skills infrastructure, to guide the AI coding agent during development. Six skills (`git-workflow`, `explore-codebase`, `powershell-patterns`, `auto-improve`, `skill-creator`, `track-tokens`) enforce Conventional Commits, efficient codebase exploration, Windows shell best practices, and cross-session learning.

The `.github/skills/` directory and `.github/instructions/default.instructions.md` are powered by prompt-forge — a drop-in toolkit that adds agent skills, an auto-improvement loop, and session tracking to any project. Zero dependencies, no build step, no backend.

---

## Documentation

- [docs/architecture.md](docs/architecture.md) — Full architectural decision record (13 ADRs, system context, confluence engine, data flow, security)
- [docs/analytical-framework.md](docs/analytical-framework.md) — Analysis methodology: market regime classification, three-pillar signal hierarchy, probabilistic confluence model, risk integration, AI role
- [docs/classical-patterns.md](docs/classical-patterns.md) — Canonical reference for 30+ technical analysis patterns: recognition criteria, market psychology, statistical edge, reliability grading, combination matrix
- [docs/classical-patterns-2026.md](docs/classical-patterns-2026.md) — Modern market adaptations: how algo trading, 0DTE options, passive flows, and market fragmentation change pattern reliability in 2026
- [docs/development-roadmap.md](docs/development-roadmap.md) — Complete development progression: 6 completed epics, 1 in-progress, 1 planned
- [prompt-forge](https://github.com/pablodiazjorge/prompt-forge) — Agentic skills infrastructure used in this project

---

## Author

pablodiazjorge — [github.com/pablodiazjorge](https://github.com/pablodiazjorge)

## License

MIT
