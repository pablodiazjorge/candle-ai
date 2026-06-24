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
| Progressive enhancement | Falls back to mock data, works without LLM, degrades gracefully |
| Local-first | Default LLM is Ollama on your hardware; cloud providers are optional |

For the full rationale behind every architectural decision, see
[docs/architecture.md](docs/architecture.md).

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Angular 22 (standalone, Signals, zoneless) | Application shell and reactivity |
| Charting | Lightweight Charts v5 (TradingView) | Candlestick series, indicators, volume |
| Overlays | D3.js | Custom pattern markers on the chart |
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
│   ├── models/          # Candle, Indicator, Pattern, AnalysisResult (TypeScript interfaces)
│   ├── services/        # market-data, indicators, patterns, analysis, pine-script
│   ├── workers/         # Web Worker for indicator calculations
│   ├── llm/             # Multi-provider LLM client (OpenAI-compatible)
│   └── state/           # Signal-based stores (ticker, cache, LLM settings)
├── features/
│   ├── ticker-selector/ # Symbol search with autocomplete + watchlist
│   ├── candle-chart/    # Lightweight Charts with candlestick series
│   ├── indicator-panel/ # Toggles: RSI, MACD, BB, EMA, SMA, Volume Profile
│   ├── pattern-overlay/ # D3.js pattern markers with sentiment badges
│   ├── analysis-dashboard/ # AI analysis: Trend, Levels, Signals, Risk, Summary
│   ├── llm-settings/    # Provider configuration panel
│   └── export-panel/    # Pine Script v5 code generation + TradingView deep link
└── shared/
    └── components/      # Reusable UI primitives
```

---

## Features

### Market Data

Fetches OHLCV candles from Yahoo Finance (`query1.finance.yahoo.com/v8/finance/chart/{symbol}`).
Caches results in IndexedDB with a 1-hour TTL. Falls back to mock SPY 6-month
data when the API is unreachable (CORS in browser environments).

### Technical Indicators (Web Worker)

All calculations run off the main thread:

| Indicator | Parameters | Display |
|-----------|-----------|---------|
| RSI | 14 periods | Line chart with 70/30 overbought/oversold lines |
| MACD | 12, 26, 9 | Histogram + signal line |
| Bollinger Bands | 20, 2 | Upper/middle/lower bands with fill |
| SMA | 20, 50, 200 | Overlay lines |
| EMA | 9, 21 | Overlay lines |
| Volume Profile | Auto | POC + Value Area (commented in Pine Script export) |

### Candlestick Patterns

11 patterns detected via rule-based analysis (no external library):

| Sentiment | Patterns |
|-----------|----------|
| 🟢 Bullish | Hammer, Bullish Engulfing, Morning Star, Bullish Harami, Three White Soldiers |
| 🔴 Bearish | Shooting Star, Bearish Engulfing, Evening Star, Bearish Harami, Three Black Crows |
| 🟡 Neutral | Doji |

### AI Analysis

The LLM receives:
- Ticker, timeframe, current price, period change
- Active indicator values (latest data points)
- Detected candlestick patterns with sentiment

It returns structured JSON with five sections: **Trend**, **Key Levels**
(support/resistance), **Signals** (buy/sell/neutral per indicator), **Risk**
(score 0-100 + description), and a natural-language **Summary**.

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
    → MarketDataService.fetchCandles() (Yahoo Finance → mock fallback)
    → TickerStore.setCandleData()
  → IndicatorsService.computeIndicators() (Web Worker)
    → TickerStore.setIndicators()
  → PatternsService.detectAll()
    → TickerStore.setPatterns()
  → User clicks "Run Analysis"
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
npm run test:unit          # Vitest (42 tests)
npm run test:unit:watch    # Watch mode
npm run test:coverage      # With coverage report
```

---

## Agentic Workflow

This project uses [prompt-forge](https://github.com/pablodiazjorge/prompt-forge), a personal agentic skills infrastructure, to guide the AI coding agent during development. Six skills (`git-workflow`, `explore-codebase`, `powershell-patterns`, `auto-improve`, `skill-creator`, `track-tokens`) enforce Conventional Commits, efficient codebase exploration, Windows shell best practices, and cross-session learning.

The `.github/skills/` directory and `.github/instructions/default.instructions.md` are powered by prompt-forge — a drop-in toolkit that adds agent skills, an auto-improvement loop, and session tracking to any project. Zero dependencies, no build step, no backend.

---

## Documentation

- [docs/architecture.md](docs/architecture.md) — Full architectural decision record (9 ADRs, system context, data flow, security)
- [prompt-forge](https://github.com/pablodiazjorge/prompt-forge) — Agentic skills infrastructure used in this project

---

## Author

pablodiazjorge — [github.com/pablodiazjorge](https://github.com/pablodiazjorge)

## License

MIT
