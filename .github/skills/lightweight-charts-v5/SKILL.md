---
name: lightweight-charts-v5
description: |
  API reference for TradingView lightweight-charts v5.x. Use when creating
  financial charts, candlestick/line/histogram series, or asking about charting
  APIs. Covers v5 breaking change: series are created via addSeries() with
  series definition variables (not classes). Sources: official migration guide
  and API docs at tradingview.github.io/lightweight-charts.
license: MIT
metadata:
  author: pablodiazjorge
  url: https://github.com/pablodiazjorge/prompt-forge
  version: "1.3"
  tokens: "0.8k"
  sources: "tradingview.github.io/lightweight-charts (API + migration guide)"
---

# lightweight-charts v5.x

API reference for TradingView's financial charting library. Covers the v5
breaking change where series creation moved from named methods to a unified
`addSeries()` API with series definition variables.

## Golden Rules

1. **Series are variables, not classes** — `CandlestickSeries`, `LineSeries`, etc. are exported as **definition variables**
2. **Always `chart.addSeries(SeriesDef, options)`** — never `chart.addCandlestickSeries()` or similar v4 methods
3. **Dynamic imports for frameworks** — `import('lightweight-charts')` in Angular/Svelte/Vue; the library is browser-only and breaks SSR/build with static top-level imports

## Critical v5 Change

Series are created via `chart.addSeries(SeriesDefinition, options)` where
`SeriesDefinition` is a **variable** (not a class), imported from the package.

### Correct (v5)

```typescript
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';

const chart = createChart(container, { width: 800, height: 400 });

const main = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a', downColor: '#ef5350'
});

const volume = chart.addSeries(HistogramSeries, {
  color: '#26a69a', priceFormat: { type: 'volume' }
});

// Options are optional
const sma = chart.addSeries(LineSeries);  // valid
```

### Anti-Patterns (v4 — removed in v5)

```typescript
chart.addCandlestickSeries()   // ❌ removed
chart.addLineSeries()          // ❌ removed
chart.addHistogramSeries()     // ❌ removed
```

## Migration Table

| v4 method | v5 equivalent |
|-----------|---------------|
| `chart.addCandlestickSeries(opts)` | `chart.addSeries(CandlestickSeries, opts)` |
| `chart.addLineSeries(opts)` | `chart.addSeries(LineSeries, opts)` |
| `chart.addHistogramSeries(opts)` | `chart.addSeries(HistogramSeries, opts)` |
| `chart.addBaselineSeries(opts)` | `chart.addSeries(BaselineSeries, opts)` |
| `chart.addAreaSeries(opts)` | `chart.addSeries(AreaSeries, opts)` |
| `chart.addBarSeries(opts)` | `chart.addSeries(BarSeries, opts)` |

## Available Series Definitions

`AreaSeries | BarSeries | BaselineSeries | CandlestickSeries | HistogramSeries | LineSeries`

All exported as **variables** from `lightweight-charts`. Import alongside
`createChart`, `createChartEx`, and `version`.

## Key Imports

```typescript
import {
  createChart, createChartEx, version,
  CandlestickSeries, LineSeries, HistogramSeries,
  AreaSeries, BarSeries, BaselineSeries
} from 'lightweight-charts';

import type {
  IChartApi, ISeriesApi, Time,
  CandlestickData, LineData, HistogramData,
  ColorType, CrosshairMode
} from 'lightweight-charts';
```

## Common Patterns

```typescript
// Candlestick + Volume
const chart = createChart(container, {
  layout: {
    background: { type: ColorType.Solid, color: '#1a1a2e' },
    textColor: '#d1d4dc'
  },
  crosshair: { mode: CrosshairMode.Normal }
});

const mainSeries = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a', downColor: '#ef5350'
});
mainSeries.setData([
  { time: '2024-01-01', open: 100, high: 110, low: 98, close: 108 }
]);

// Responsive chart
new ResizeObserver(entries => {
  for (const e of entries) {
    chart.applyOptions({
      width: e.contentRect.width,
      height: e.contentRect.height
    });
  }
}).observe(container);
```

## Quick Reference

| Task | Code |
|------|------|
| Create chart | `createChart(element, options)` |
| Add series | `chart.addSeries(CandlestickSeries, opts)` |
| Set data | `series.setData(array)` |
| Update point | `series.update(dataPoint)` |
| Remove series | `chart.removeSeries(series)` |
| Resize | `chart.applyOptions({ width, height })` |
| Fit content | `chart.timeScale().fitContent()` |
| Set markers | `series.setMarkers(markers)` |
| Price line | `series.createPriceLine({ price, color })` |

## Framework Integration

| Framework | Approach |
|-----------|----------|
| Angular | `import('lightweight-charts')` in component, avoid static top-level imports |
| React | `const { createChart } = await import('lightweight-charts')` in `useEffect` |
| Svelte | `onMount(async () => { const lib = await import('lightweight-charts') })` |
| Vue | `import('lightweight-charts')` in `onMounted` hook |

> The library accesses browser APIs (`Canvas`, `ResizeObserver`). Static imports
> at the top level break SSR, prerendering, and build steps in all frameworks.

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| `addCandlestickSeries is not a function` | Use `chart.addSeries(CandlestickSeries, opts)` |
| `CandlestickSeries is not a constructor` | It's a variable, not a class — don't use `new` |
| SSR/build error with `Canvas` | Use dynamic `import('lightweight-charts')` |
| Chart not visible | Container must have explicit `width`/`height` in CSS |
| Data not rendering | Time must be `Time` type (`string` ISO or `UTCTimestamp`) |
| Series type mismatch | `CandlestickSeries` only takes `CandlestickData[]`, etc. |
