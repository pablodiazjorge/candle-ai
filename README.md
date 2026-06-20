# Candle AI — Trading Analysis Dashboard

Client-side technical analysis application for financial markets (NASDAQ, S&P 500, BTC, gold, etc.).

## Tech Stack

- **Angular 22** — standalone components, Signals, zoneless change detection
- **Lightweight Charts** — TradingView's canvas-based charting library
- **D3.js** — pattern overlays on charts
- **Web Workers** — heavy indicator calculations off the main thread
- **Multi-LLM** — OpenAI-compatible (DeepSeek, OpenAI, Groq, Together AI, llama.cpp, Ollama…)
- **Dexie.js** — IndexedDB wrapper for historical data caching (1-hour TTL)
- **Tailwind CSS** — utility-first styling
- **ngx-translate** — runtime i18n (ES/EN)
- **Vitest** — unit testing

## Architecture

```
src/app/
├── core/
│   ├── models/          # Candle, Indicator, Pattern, AnalysisResult
│   ├── services/        # market-data, indicators, patterns, analysis, pine-script
│   ├── workers/         # Web Worker for indicator calculations
│   ├── llm/             # DeepSeek (OpenAI-compatible) provider
│   └── state/           # Signal-based stores (ticker, cache)
├── features/
│   ├── ticker-selector/ # Symbol search with autocomplete
│   ├── candle-chart/    # Lightweight Charts with candlestick series
│   ├── indicator-panel/ # Toggles for RSI, MACD, BB, EMA, SMA, Volume
│   ├── pattern-overlay/ # D3.js pattern markers on chart
│   ├── analysis-dashboard/ # LLM analysis panel
│   └── export-panel/    # Pine Script export
└── shared/
    └── components/      # Buttons, loaders, tooltips
```

## Data Source

Yahoo Finance (free, unofficial) via `query1.finance.yahoo.com/v8/finance/chart/{symbol}`. Fallback: mock SPY 6-month data at `public/assets/sample-data/spy-6m.json`.

## Quick Start

```bash
nvm use 22.22.3
npm install
ng serve
```

Open `http://localhost:4200`.

## Build

```bash
ng build --configuration production
```

## LLM Configuration

Click the ⚙️ button in the top bar to configure the LLM provider. Supports any OpenAI-compatible API:

| Provider | Base URL |
|---|---|
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Together AI | `https://api.together.xyz/v1` |
| llama.cpp (local) | `http://localhost:8080/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| Custom | Any OpenAI-compatible endpoint |

Settings are persisted in `localStorage`. No data is ever sent to any server except the configured LLM endpoint.

## i18n

Translation files at `public/i18n/{en,es}.json`. Runtime switching via ngx-translate.