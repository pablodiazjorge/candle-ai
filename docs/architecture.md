# Candle AI: Architecture Document

## Purpose and Scope

This document describes the architecture of Candle AI, a client-side technical
analysis dashboard that combines financial charting with AI-powered market
analysis. It is written for contributors evaluating the codebase and for users
who want to understand the design decisions behind the application.

The document follows the conventions of Architectural Decision Records (ADR) as
popularized by Michael Nygard and formalized by the MADR project.

---

## System Context

Candle AI is a single-page application that runs entirely in the browser. It
has no backend server, no database, and no server-side rendering. The only
outbound network requests are to Yahoo Finance for market data and to an
LLM endpoint for AI analysis — both initiated client-side.

```
Browser
+-----------------------------------------------------------------+
|  Angular 22 App (Zoneless, Signals, Standalone)                 |
|                                                                 |
|  +--------------------------+  +------------------------------+  |
|  | Web Worker               |  | Main Thread                  |  |
|  | (indicators.worker.ts)   |  |                              |  |
|  | - RSI, MACD, BB          |  |  Lightweight Charts          |  |
|  | - SMA, EMA               |  |  D3.js Overlays              |  |
|  | - Volume Profile         |  |  Angular Components          |  |
|  |                          |  |  Signal-based State          |  |
|  +--------------------------+  +------------------------------+  |
|                                                                 |
|  +--------------------------+  +------------------------------+  |
|  | IndexedDB                |  | HTTP (fetch)                 |  |
|  | (Dexie.js)               |  | → Yahoo Finance              |  |
|  | Cache TTL: 1h            |  | → LLM Provider               |  |
|  +--------------------------+  +------------------------------+  |
+-----------------------------------------------------------------+
                |                                  |
                v                                  v
+--------------------------+  +------------------------------+
| Yahoo Finance            |  | LLM Endpoint                 |
| (market data)            |  | (Ollama, DeepSeek,           |
| Fallback: mock           |  |  OpenAI, Groq, etc.)         |
+--------------------------+  +------------------------------+
```

---

## Architectural Principles

These principles guided every design decision in this document.

**Principle 1: Zero backend.**
Everything runs in the browser. No server, no database, no API middleware.
The user's data never leaves their machine except to the LLM endpoint they
configure themselves.

**Principle 2: Non-blocking UI.**
Any computation on more than 100 data points runs in a Web Worker. The main
thread stays free for chart rendering and user interaction.

**Principle 3: Reactive by default.**
All state uses Angular Signals. No RxJS BehaviorSubjects, no zone.js
dependency. Change detection is zoneless and signal-driven.

**Principle 4: Progressive enhancement.**
The app works with mock data when Yahoo Finance is unreachable (CORS).
The LLM analysis is optional — indicators and patterns work without it.
Every feature degrades gracefully.

**Principle 5: Local-first.**
The default LLM preset is Ollama, which runs on the user's hardware. Cloud
providers are available but not required. IndexedDB caches market data to
reduce API calls.

---

## Decision Log

### ADR-001: Angular Signals over RxJS BehaviorSubject

**Context.**
The application needs reactive state management for ticker selection, market
data, indicators, patterns, and analysis results. Angular 22 offers both the
traditional RxJS-based approach (BehaviorSubject + async pipe) and the new
Signal-based approach.

**Options considered.**

A. RxJS BehaviorSubject with async pipe. The established Angular pattern.
Familiar to most Angular developers. Requires zone.js for change detection.

B. Angular Signals with computed() and effect(). The new reactive primitive.
Zone-less compatible. Simpler API. Automatic dependency tracking without
subscription management.

**Decision.**
Use Angular Signals exclusively. No BehaviorSubject, no Observable chains,
no async pipe.

**Rationale.**
Signals are the future of Angular reactivity. They enable zoneless change
detection, which reduces bundle size (~10 KB) and improves runtime
performance. The API surface is smaller: `signal()`, `computed()`, `effect()`
replace a dozen RxJS operators. Dependency tracking is automatic — there
are no subscriptions to manage or leak.

**Consequences.**
Developers coming from older Angular codebases need to learn the Signal API.
The `effect()` function must be called in an injection context (constructor
or field initializer), not in lifecycle hooks like `ngOnInit`. This caused
a runtime error during development that was resolved by moving the ticker
subscription effect to the constructor.

---

### ADR-002: Web Workers for Indicator Calculations

**Context.**
Technical indicators (RSI, MACD, Bollinger Bands, SMA, EMA, Volume Profile)
require O(n) calculations per indicator over candle arrays that can exceed
500 data points. Running these on the main thread would block chart rendering
and user interaction.

**Options considered.**

A. Main-thread computation with requestAnimationFrame chunking. Simple but
still blocks the UI during each chunk. Complex scheduling logic.

B. Web Worker with postMessage communication. True parallelism. The worker
runs on a separate thread. Communication is asynchronous and non-blocking.

C. WebAssembly compiled from Rust/C++. Maximum performance but adds a build
step, toolchain dependency, and significant complexity for computations that
are already fast enough in pure JS.

**Decision.**
Use a Web Worker (`indicators.worker.ts`) for all indicator calculations.
The `IndicatorsService` acts as an orchestrator: it creates the worker lazily,
sends candle data and settings via `postMessage`, and resolves a Promise
when the worker responds.

**Rationale.**
Web Workers are a web standard with universal browser support. They provide
true parallelism without any build tooling or dependencies. The `postMessage`
API is simple and the data volume (candles + results) is well within the
structured clone algorithm's practical limits (~100 KB for 500 candles).
The lazy creation pattern avoids the overhead of an idle worker.

**Consequences.**
The worker is loaded as a separate chunk (lazy loading, ~2.6 KB). Debugging
worker code requires opening Chrome's worker inspector. The service-worker
communication pattern (request → response pairing) requires careful listener
management to avoid handling stale responses.

---

### ADR-003: Provider-Agnostic LLM Abstraction

**Context.**
The application needs to support multiple LLM providers: local (Ollama,
llama.cpp) and cloud (DeepSeek, OpenAI, Groq, Together AI). Each provider
has the same OpenAI-compatible chat completions API, but they differ in
capabilities: some support `response_format: json_object`, others do not.
Some are reasoning models that output chain-of-thought; others are standard
instruct models.

**Options considered.**

A. Provider-specific service classes with a common interface. Maximum
flexibility but leads to duplicated code and makes adding a provider
a multi-file change.

B. Single generic provider with configuration presets. One `LlmProvider`
class parameterized by a `LlmProviderConfig`. Presets are a static array
that can be extended without code changes.

**Decision.**
Use a single `LlmProvider` class with the OpenAI chat completions contract.
Define presets in `LLM_PROVIDER_PRESETS[]` with base URL, model name, API
key placeholder, max tokens, and temperature. The provider detects local
endpoints (localhost/127.0.0.1/ollama) and skips `response_format` for them.

**Rationale.**
The OpenAI chat completions API is the de facto standard. Every major
provider — local and cloud — implements it. A single generic provider with
configuration is simpler, more testable, and easier to extend than a
class hierarchy. Adding a new provider is a one-line addition to the
presets array.

**Consequences.**
The provider cannot support APIs that deviate significantly from the OpenAI
format (e.g., Anthropic's Messages API, Gemini's generateContent). These
would require separate provider classes. The `response_format` detection
by URL is a heuristic; a model that supports JSON mode on a non-local
endpoint would not receive the parameter.

---

### ADR-004: IndexedDB Caching with 1-Hour TTL

**Context.**
Market data from Yahoo Finance changes infrequently for daily timeframes
and is rate-limited. Repeated fetches for the same ticker + interval + range
combination waste bandwidth and slow down the UI. A client-side cache is needed.

**Options considered.**

A. localStorage. Simple but synchronous, blocking the main thread. Limited
to ~5 MB. No query capabilities.

B. In-memory Map with no persistence. Fast but loses data on page refresh.
Defeats the purpose of caching.

C. IndexedDB via Dexie.js with TTL-based expiration. Async, non-blocking,
virtually unlimited storage. Dexie provides a Promise-based API that is
significantly more ergonomic than raw IndexedDB.

**Decision.**
Use Dexie.js (IndexedDB wrapper) with a 1-hour TTL. The cache key is a
composite of ticker + interval + range. On startup, expired entries are
purged via `cacheStore.purgeExpired()`.

**Rationale.**
IndexedDB is the only browser storage API that is both asynchronous and
capable of storing large datasets. Dexie.js reduces the boilerplate of raw
IndexedDB from ~50 lines to ~10. The 1-hour TTL is a conservative default:
it ensures data freshness while avoiding redundant fetches during an active
trading session.

**Consequences.**
IndexedDB is cleared when the user clears browser data. The cache is
per-browser, not shared across devices. The TTL is fixed; there is no
cache-busting mechanism for stale-but-not-expired data.

---

### ADR-005: Runtime i18n with ngx-translate

**Context.**
The application must support English and Spanish. The translations must
switch at runtime without a page reload. The translation files must be
lazy-loaded to avoid bloating the initial bundle.

**Options considered.**

A. Angular built-in `@angular/localize`. Compile-time i18n. Produces
separate builds per language. No runtime switching. Requires a server-side
redirect or multiple deployments.

B. ngx-translate with JSON files in `public/i18n/`. Runtime switching.
Lazy-loaded via HTTP. Functional providers in v18 (no NgModule).

**Decision.**
Use `@ngx-translate/core` v18 with `@ngx-translate/http-loader`. Translation
files live at `public/i18n/{en,es}.json`. The app detects the browser language
on first load and falls back to English.

**Rationale.**
Runtime switching is essential for a dashboard that might be used by
multilingual teams. Compile-time i18n would require rebuilding for every
language switch. ngx-translate v18 uses functional providers
(`provideTranslateService`, `provideTranslateHttpLoader`) which align with
Angular's standalone component architecture.

**Consequences.**
Translation files are fetched on demand, adding one HTTP request per
language switch. The `TranslatePipe` must be imported in every standalone
component that uses it. The `innerHTML` binding is used for translations
containing HTML tags (welcome screen steps), which requires trusting the
translation content.

---

### ADR-006: Lightweight Charts over D3.js for Main Chart

**Context.**
The application needs a financial chart with candlestick series, volume
histograms, and multiple indicator overlays. Performance is critical: the
chart must render smoothly when panning and zooming through hundreds of
candles.

**Options considered.**

A. D3.js for everything. Maximum customization. Canvas-based rendering
possible but requires manual implementation of zoom, pan, crosshair, and
series management.

B. Lightweight Charts (TradingView) for the main chart, D3.js only for
pattern overlays. LW provides candlestick series, volume, indicators,
crosshair, and time axis out of the box.

**Decision.**
Use Lightweight Charts for the main chart and indicator series. Reserve
D3.js for pattern markers that require custom SVG overlays (labels,
tooltips on detected patterns).

**Rationale.**
Lightweight Charts is purpose-built for financial charting. It handles
candlestick rendering, time axis formatting, zoom/pan, crosshair, and
responsive sizing with minimal configuration. Implementing the same in
raw D3.js would require hundreds of lines of code and ongoing maintenance
for edge cases. D3.js is used only where LW's API is insufficient: custom
pattern markers with hover tooltips.

**Consequences.**
The application has two charting dependencies instead of one. LW uses a
canvas-based renderer; D3 overlays use SVG. This means two separate
coordinate systems that must be kept in sync during zoom and pan events.

---

### ADR-007: CSS Custom Properties for Dark/Light Theming

**Context.**
The application must support dark and light themes, switchable at runtime,
with the preference persisted across sessions.

**Options considered.**

A. CSS class-based theming (`body.dark`, `body.light`). Simple but requires
duplicating selectors or using descendant selectors that increase specificity.

B. CSS custom properties with a `data-theme` attribute on `<html>`. A single
set of CSS variables defined in `:root` and overridden in `[data-theme="light"]`.
Components use `var(--color-*)` throughout.

**Decision.**
Use CSS custom properties with `data-theme` attribute. Define all color
values as custom properties in `styles.css`. Toggle the attribute via a
`ThemeService` that persists to `localStorage`.

**Rationale.**
Custom properties are the standard approach for runtime theming in modern
CSS. They cascade naturally, require no duplicate selectors, and are
transitionable. The `data-theme` attribute is a clean semantic signal that
is easy to inspect in DevTools and toggle programmatically.

**Consequences.**
All 28 color variables must be defined for both themes. Adding a new color
requires adding it to both `:root` and `[data-theme="light"]`. Components
that use hardcoded colors (e.g., Lightweight Charts configuration) need
explicit theme-aware updates when the theme changes.

---

### ADR-008: Pine Script v5 Code Generation

**Context.**
Users want to export their analysis to TradingView's Pine Editor for
backtesting and alert creation. The export must include all active
indicators and detected patterns.

**Options considered.**

A. Screenshot export. Trivial but useless for TradingView — no code to
modify or backtest.

B. JSON export of indicator values. Machine-readable but not compatible
with TradingView.

C. Pine Script v5 code generation. Generates a `.pine` file with `plot()`,
`ta.sma()`, `ta.rsi()`, `ta.macd()`, `ta.bb()`, and annotated pattern labels.

**Decision.**
Generate Pine Script v5 code from the internal state (active indicators,
indicator results, detected patterns). Include copy-to-clipboard, file
download, and a deep link to TradingView.

**Rationale.**
Pine Script is TradingView's native language. Generating valid v5 code
allows users to paste directly into the Pine Editor and extend the analysis.
The code generation is deterministic and testable: given the same indicators
and patterns, the output is identical.

**Consequences.**
The generated code is not a complete trading strategy — it is an indicator
script with overlays. Users must add entry/exit logic themselves. Some
TradingView features (Volume Profile) cannot be fully replicated in Pine
Script; these are included as comments with the computed POC and value area.

---

### ADR-009: Vitest for Unit Testing

**Context.**
The application needs unit tests for core services, the Web Worker, pattern
detection, and utility functions.

**Options considered.**

A. Jasmine + Karma (Angular default). Included with Angular CLI but slow
startup, complex configuration, and a different assertion style.

B. Vitest with jsdom. Faster startup, native ESM support, compatible with
the project's TypeScript configuration, and a Jest-compatible API.

**Decision.**
Use Vitest with jsdom environment. Test pure functions directly without
Angular TestBed. Angular DI is avoided in tests by replicating the pure
logic functions.

**Rationale.**
Vitest is significantly faster than Karma (sub-second startup vs 5-10
seconds). The pure-function testing approach — testing the algorithm
logic directly rather than through Angular's DI — makes tests simpler,
faster, and more focused. The pattern detection, indicator calculation,
and Pine Script generation are all pure functions that require no Angular
context.

**Consequences.**
Services that depend on Angular DI (TickerStore, AnalysisService) are
not unit-tested in isolation. They are covered by the pure-function tests
of their underlying algorithms. Integration tests would require TestBed
or a component test harness, which is left as future work.

---

## Component Architecture

### Core Layer

The `core/` directory contains domain models (plain TypeScript interfaces),
services (business logic), state stores (Signal-based reactive state),
the LLM provider abstraction, and the Web Worker for indicators.

State flows from top to bottom:
- `TickerStore` holds the single source of truth for the current ticker,
  timeframe, candle data, indicators, patterns, and analysis.
- Components read state via `store.signalName()` and write via
  `store.setXxx()`.
- Services are injected into components or the App root and operate on
  the store's signals.

### Feature Layer

Each feature is a standalone Angular component under `features/`. Features
are lazy-loaded via the Angular router and communicate only through the
shared stores, never directly with each other.

### Data Flow: Analysis Cycle

```
User selects ticker
  → TickerStore.selectTicker()
  → effect() triggers loadMarketData()
    → CacheStore.get() (IndexedDB)
    → MarketDataService.fetchCandles() (Yahoo Finance, fallback mock)
    → CacheStore.set() (1h TTL)
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

## Security Considerations

Candle AI is a client-only application. The only outbound network requests are:

1. **Yahoo Finance API** — read-only market data. No authentication.
   CORS-blocked in browsers; falls back to mock data.

2. **LLM Endpoint** — user-configured. The API key is stored in `localStorage`
   and sent as a Bearer token. The analysis prompt includes the ticker,
   timeframe, indicator values, and pattern names — not raw candle data —
   to minimize data exposure.

No user data is collected, stored server-side, or transmitted to third
parties other than the configured LLM endpoint.

---

## Known Limitations

**CORS on Yahoo Finance.**
The Yahoo Finance API does not set CORS headers for browser requests. The
app falls back to mock SPY 6-month data. A production deployment would
need a CORS proxy or an alternative data source (Alpha Vantage, Polygon.io).

**Pattern detection false positives.**
The pattern detectors are rule-based and generate false positives on noisy
data. This is inherent to candlestick pattern recognition. The confidence
score provides a signal-to-noise filter, but the raw pattern list can be
verbose.

**LLM JSON reliability.**
Reasoning models (o1, o3, deepseek-r1, qwen3) output chain-of-thought that
cannot be parsed as JSON. The app falls back gracefully with a clear error
message. Standard chat/instruct models (llama3.1, gpt-4o, deepseek-chat,
claude-3.5-sonnet) produce valid JSON reliably.

**No real-time data.**
The app fetches data on demand, not via WebSocket streaming. It is designed
for daily and swing trading analysis, not high-frequency or intraday scalping.

**Single-chart layout.**
The app displays one ticker at a time. Multi-chart layouts (e.g., comparing
SPY vs QQQ) are not supported in this version.

---

## References

- Architectural Decision Records: https://adr.github.io/
- MADR (Markdown Architectural Decision Records): https://adr.github.io/madr/
- Angular Signals: https://angular.dev/guide/signals
- Lightweight Charts v5: https://tradingview.github.io/lightweight-charts/
- Ollama: https://ollama.com
- Dexie.js: https://dexie.org
- Pine Script v5: https://www.tradingview.com/pine-script-docs/
- ngx-translate v18: https://github.com/ngx-translate/core
- prompt-forge (agentic skills infrastructure): https://github.com/pablodiazjorge/prompt-forge
