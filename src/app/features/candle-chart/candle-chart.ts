import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  effect,
  input,
  inject,
  signal,
} from '@angular/core';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  ColorType,
  CrosshairMode,
  Time,
  CandlestickData,
  LineData,
  HistogramData,
  SeriesMarker,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  PriceScaleMode,
} from 'lightweight-charts';
import { TranslatePipe } from '@ngx-translate/core';
import { TickerStore } from '../../core/state/ticker.store';
import { Candle } from '../../core/models/candle.model';
import { IndicatorResults } from '../../core/models/indicator.model';
import { DetectedPattern } from '../../core/models/pattern.model';

@Component({
  selector: 'app-candle-chart',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './candle-chart.html',
  styleUrl: './candle-chart.css',
})
export class CandleChart implements AfterViewInit, OnDestroy {
  private readonly store = inject(TickerStore);
  @ViewChild('chartContainer') chartContainer!: ElementRef<HTMLDivElement>;

  readonly candleData = input<Candle[]>([]);
  readonly indicators = input<IndicatorResults | null>(null);
  readonly patterns = input<DetectedPattern[]>([]);

  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<'Candlestick'> | null = null;
  private indicatorSeries: ISeriesApi<'Line'>[] = [];
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private rsiSeries: ISeriesApi<'Line'> | null = null;
  private macdHistogramSeries: ISeriesApi<'Histogram'> | null = null;
  private macdSignalSeries: ISeriesApi<'Line'> | null = null;
  private macdLineSeries: ISeriesApi<'Line'> | null = null;
  private markersPlugin: ISeriesMarkersPluginApi<Time> | null = null;
  private volumeProfileLines: any[] = [];
  private volumeMarkers = signal<SeriesMarker<Time>[]>([]);
  private themeObserver: MutationObserver | null = null;

  private readonly resizeObserver = new ResizeObserver(() => {
    if (this.chart && this.chartContainer) {
      this.chart.applyOptions({
        width: this.chartContainer.nativeElement.clientWidth,
        height: this.chartContainer.nativeElement.clientHeight,
      });
    }
  });

  constructor() {
    // React to data changes
    effect(() => {
      const data = this.candleData();
      if (data.length > 0 && this.candleSeries) {
        this.updateCandleSeries(data);
      }
    });

    effect(() => {
      const ind = this.indicators();
      if (ind && this.chart) {
        this.updateIndicatorSeries(ind);
      }
    });

    effect(() => {
      const pat = this.patterns();
      const visibleTypes = this.store.visiblePatternTypes();
      if (this.candleSeries && this.markersPlugin) {
        let markers: SeriesMarker<Time>[] = [];
        if (visibleTypes.size > 0) {
          const filtered = pat.filter((p) => visibleTypes.has(p.type));
          markers = this.buildPatternMarkers(filtered);
        }
        // Merge volume markers (tracked as signal)
        markers = [...markers, ...this.volumeMarkers()];
        this.markersPlugin.setMarkers(markers);
      }
    });

  }

  private isDark(): boolean {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  }

  ngAfterViewInit(): void {
    this.initChart();
    if (this.candleData().length > 0) {
      this.updateCandleSeries(this.candleData());
    }

    // Observe theme attribute changes on <html> for live switching
    const observer = new MutationObserver(() => {
      this.applyTheme(this.isDark());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    this.themeObserver = observer;
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    this.themeObserver?.disconnect();
    this.chart?.remove();
  }

  private initChart(): void {
    const container = this.chartContainer.nativeElement;
    const isDark = this.isDark();

    this.chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#94a3b8' : '#334155',
      },
      grid: {
        vertLines: { color: isDark ? '#1e2130' : '#e2e8f0' },
        horzLines: { color: isDark ? '#1e2130' : '#e2e8f0' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: isDark ? '#787878' : '#94a3b8', style: 2, width: 1, labelBackgroundColor: isDark ? '#787878' : '#94a3b8' },
        horzLine: { color: isDark ? '#787878' : '#94a3b8', style: 2, width: 1, labelBackgroundColor: isDark ? '#787878' : '#94a3b8' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#2a2e44' : '#cbd5e1',
      },
      timeScale: {
        borderColor: isDark ? '#2a2e44' : '#cbd5e1',
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    // Candlestick series (lightweight-charts v5 API)
    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    // Pattern markers plugin (v5)
    this.markersPlugin = createSeriesMarkers(this.candleSeries, []);

    this.resizeObserver.observe(container);
  }

  private applyTheme(isDark: boolean): void {
    if (!this.chart) return;
    this.chart.applyOptions({
      layout: { textColor: isDark ? '#94a3b8' : '#334155' },
      grid: {
        vertLines: { color: isDark ? '#1e2130' : '#e2e8f0' },
        horzLines: { color: isDark ? '#1e2130' : '#e2e8f0' },
      },
      crosshair: {
        vertLine: { color: isDark ? '#787878' : '#94a3b8', labelBackgroundColor: isDark ? '#787878' : '#94a3b8' },
        horzLine: { color: isDark ? '#787878' : '#94a3b8', labelBackgroundColor: isDark ? '#787878' : '#94a3b8' },
      },
      rightPriceScale: { borderColor: isDark ? '#2a2e44' : '#cbd5e1' },
      timeScale: { borderColor: isDark ? '#2a2e44' : '#cbd5e1' },
    });
  }

  private updateCandleSeries(data: Candle[]): void {
    if (!this.candleSeries) return;

    const candleData: CandlestickData[] = data.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    this.candleSeries.setData(candleData);

    // Fit content
    this.chart?.timeScale().fitContent();
  }

  private updateIndicatorSeries(ind: IndicatorResults): void {
    // Clear previous indicator series
    this.clearIndicatorSeries();

    if (!this.chart) return;

    // SMA 20
    if (ind.sma20 && Object.keys(ind.sma20.values).length > 0) {
      this.addLineSeries(ind.sma20.values, '#b8b8b8', 'SMA 20');
    }
    // SMA 50
    if (ind.sma50 && Object.keys(ind.sma50.values).length > 0) {
      this.addLineSeries(ind.sma50.values, '#a855f7', 'SMA 50');
    }
    // SMA 200
    if (ind.sma200 && Object.keys(ind.sma200.values).length > 0) {
      this.addLineSeries(ind.sma200.values, '#eab308', 'SMA 200');
    }
    // EMA 9
    if (ind.ema9 && Object.keys(ind.ema9.values).length > 0) {
      this.addLineSeries(ind.ema9.values, '#22c55e', 'EMA 9');
    }
    // EMA 21
    if (ind.ema21 && Object.keys(ind.ema21.values).length > 0) {
      this.addLineSeries(ind.ema21.values, '#ef4444', 'EMA 21');
    }
    // Bollinger Bands
    if (ind.bb && Object.keys(ind.bb.values).length > 0) {
      this.addLineSeries(
        Object.fromEntries(Object.entries(ind.bb.values).map(([t, v]) => [t, v.upper])),
        '#64748b',
        'BB Upper',
      );
      this.addLineSeries(
        Object.fromEntries(Object.entries(ind.bb.values).map(([t, v]) => [t, v.middle])),
        '#94a3b8',
        'BB Middle',
      );
      this.addLineSeries(
        Object.fromEntries(Object.entries(ind.bb.values).map(([t, v]) => [t, v.lower])),
        '#64748b',
        'BB Lower',
      );
    }

    // RSI (on its own price scale at bottom portion of pane)
    if (ind.rsi && Object.keys(ind.rsi.values).length > 0) {
      this.renderRsi(ind.rsi.values);
    }

    // MACD (on its own price scale in same pane)
    if (ind.macd && Object.keys(ind.macd.values).length > 0) {
      this.renderMacd(ind.macd.values);
    }

    // ADX (on its own price scale)
    if (ind.adx && Object.keys(ind.adx.values).length > 0) {
      this.renderAdx(ind.adx.values);
    }

    // Volume Profile POC marker
    if (ind.volumeProfile && ind.volumeProfile.levels.length > 0) {
      this.renderVolumeProfileMarkers(ind.volumeProfile);
    } else {
      // Clear price lines when volume profile is off
      for (const line of this.volumeProfileLines) {
        try { line._priceLine?.remove?.(); } catch { /* ignore */ }
        try { this.candleSeries?.removePriceLine?.(line); } catch { /* ignore */ }
      }
      this.volumeProfileLines = [];
    }

    // Collect volume analysis markers (merged with pattern markers)
    const volMarkers: SeriesMarker<Time>[] = [];
    if (ind.volumeClimax) {
      for (const s of ind.volumeClimax.spikes.slice(-10)) {
        volMarkers.push({ time: s.time as Time, position: 'aboveBar', color: '#f59e0b88', shape: 'arrowDown', text: '', size: 1 });
      }
    }
    if (ind.volumeDryUp) {
      for (const d of ind.volumeDryUp.dips.slice(-10)) {
        volMarkers.push({ time: d.time as Time, position: 'belowBar', color: '#06b6d488', shape: 'circle', text: '', size: 1 });
      }
    }
    if (ind.volumeDivergence) {
      for (const d of ind.volumeDivergence.divergences.slice(-15)) {
        volMarkers.push({
          time: d.time as Time,
          position: d.type === 'bullish' ? 'belowBar' : 'aboveBar',
          color: (d.type === 'bullish' ? '#22c55e88' : '#ef444488'),
          shape: 'square',
          text: '',
          size: 1,
        });
      }
    }
    this.volumeMarkers.set(volMarkers);
  }

  private renderRsi(values: Record<number, number>): void {
    if (!this.chart) return;

    this.rsiSeries = this.chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      priceScaleId: 'rsi-scale',
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    });

    const lineData: LineData[] = Object.entries(values)
      .map(([time, value]) => ({ time: Number(time) as Time, value }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    this.rsiSeries.setData(lineData);

    // Configure RSI price scale
    this.chart.priceScale('rsi-scale').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      mode: PriceScaleMode.Normal,
      borderColor: '#f59e0b',
      autoScale: false,
    });

    // Add overbought/oversold reference lines
    this.indicatorSeries.push(
      this.chart.addSeries(LineSeries, {
        color: '#ef444466',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'rsi-scale',
      }),
    );
    const firstTime = Number(Object.keys(values)[0]) as Time;
    const lastTime = Number(Object.keys(values)[Object.keys(values).length - 1]) as Time;
    this.indicatorSeries[this.indicatorSeries.length - 1].setData([
      { time: firstTime, value: 70 },
      { time: lastTime, value: 70 },
    ]);

    this.indicatorSeries.push(
      this.chart.addSeries(LineSeries, {
        color: '#22c55e66',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'rsi-scale',
      }),
    );
    this.indicatorSeries[this.indicatorSeries.length - 1].setData([
      { time: firstTime, value: 30 },
      { time: lastTime, value: 30 },
    ]);
  }

  private renderMacd(values: Record<number, { macd: number; signal: number; histogram: number }>): void {
    if (!this.chart) return;

    // MACD Histogram
    this.macdHistogramSeries = this.chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: 'macd-scale',
      priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
    });

    const histData: HistogramData[] = Object.entries(values)
      .map(([time, v]) => ({
        time: Number(time) as Time,
        value: v.histogram,
        color: v.histogram >= 0 ? '#22c55e66' : '#ef444466',
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    this.macdHistogramSeries.setData(histData);

    // MACD Signal line
    this.macdSignalSeries = this.chart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceScaleId: 'macd-scale',
    });

    const signalData: LineData[] = Object.entries(values)
      .map(([time, v]) => ({ time: Number(time) as Time, value: v.signal }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    this.macdSignalSeries.setData(signalData);

    // MACD line
    this.macdLineSeries = this.chart.addSeries(LineSeries, {
      color: '#787878',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceScaleId: 'macd-scale',
    });

    const macdData: LineData[] = Object.entries(values)
      .map(([time, v]) => ({ time: Number(time) as Time, value: v.macd }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    this.macdLineSeries.setData(macdData);

    // Configure MACD price scale
    this.chart.priceScale('macd-scale').applyOptions({
      scaleMargins: { top: 0.9, bottom: 0.02 },
      mode: PriceScaleMode.Normal,
    });
  }

  private renderAdx(values: Record<number, number>): void {
    if (!this.chart) return;

    // Render ADX on its own price scale (0-100 range, not mixed with price)
    const adxSeries = this.chart.addSeries(LineSeries, {
      color: '#06b6d4',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      priceScaleId: 'adx-scale',
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    });

    const lineData: LineData[] = Object.entries(values)
      .map(([time, value]) => ({ time: Number(time) as Time, value }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    adxSeries.setData(lineData);

    this.chart.priceScale('adx-scale').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0.02 },
      mode: PriceScaleMode.Normal,
      borderColor: '#06b6d4',
    });

    this.indicatorSeries.push(adxSeries);
  }

  private renderVolumeProfileMarkers(vp: { poc: number; valueAreaHigh: number; valueAreaLow: number }): void {
    if (!this.candleSeries) return;

    // Clear previous price lines
    for (const line of this.volumeProfileLines) {
      try { line._priceLine?.remove?.(); } catch { /* ignore */ }
      try { this.candleSeries.removePriceLine?.(line); } catch { /* ignore */ }
    }
    this.volumeProfileLines = [];

    const poc = this.candleSeries.createPriceLine({
      price: vp.poc,
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: 'POC',
    });
    const vah = this.candleSeries.createPriceLine({
      price: vp.valueAreaHigh,
      color: '#f59e0b66',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'VAH',
    });
    const val = this.candleSeries.createPriceLine({
      price: vp.valueAreaLow,
      color: '#f59e0b66',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'VAL',
    });
    this.volumeProfileLines = [poc, vah, val];
  }

  private addLineSeries(values: Record<number, number>, color: string, _label: string): void {
    if (!this.chart) return;

    const lineSeries = this.chart.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const lineData: LineData[] = Object.entries(values)
      .map(([time, value]) => ({
        time: Number(time) as Time,
        value,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    lineSeries.setData(lineData);
    this.indicatorSeries.push(lineSeries);
  }

  private clearIndicatorSeries(): void {
    for (const series of this.indicatorSeries) {
      this.chart?.removeSeries(series);
    }
    this.indicatorSeries = [];

    if (this.rsiSeries) {
      this.chart?.removeSeries(this.rsiSeries);
      this.rsiSeries = null;
    }
    if (this.macdHistogramSeries) {
      this.chart?.removeSeries(this.macdHistogramSeries);
      this.macdHistogramSeries = null;
    }
    if (this.macdSignalSeries) {
      this.chart?.removeSeries(this.macdSignalSeries);
      this.macdSignalSeries = null;
    }
    if (this.macdLineSeries) {
      this.chart?.removeSeries(this.macdLineSeries);
      this.macdLineSeries = null;
    }
  }

  /** Build pattern markers array (does not set them — caller merges with volume markers) */
  private buildPatternMarkers(patterns: DetectedPattern[]): SeriesMarker<Time>[] {
    if (patterns.length === 0) return [];

    const sentimentConfig: Record<string, { color: string; shape: 'arrowUp' | 'arrowDown' | 'circle' }> = {
      bullish: { color: '#22c55eaa', shape: 'arrowUp' },
      bearish: { color: '#ef4444aa', shape: 'arrowDown' },
      neutral: { color: '#fbbf2488', shape: 'circle' },
    };

    const ABBREV: Record<string, string> = {
      doji: 'D', hammer: 'H', shooting_star: 'SS',
      bullish_engulfing: '▲', bearish_engulfing: '▼',
      morning_star: '☆', evening_star: '★',
      bullish_harami: 'H+', bearish_harami: 'H−',
      three_white_soldiers: '3▲', three_black_crows: '3▼',
      double_top: '2T', double_bottom: '2B',
      head_and_shoulders: 'H&S', inverse_head_and_shoulders: 'iHS',
    };

    // Deduplicate: one marker per 3 candles, keep highest confidence
    const deduped: DetectedPattern[] = [];
    const seen = new Set<number>();
    for (const p of [...patterns].sort((a, b) => b.confidence - a.confidence)) {
      const bucket = Math.floor(p.time / (86400 * 3)); // 3-day bucket
      if (!seen.has(bucket)) {
        seen.add(bucket);
        deduped.push(p);
      }
    }
    // Limit to last 25 markers to avoid clutter
    const limited = deduped.sort((a, b) => a.time - b.time).slice(-25);

    return limited.map((p) => {
      const cfg = sentimentConfig[p.sentiment] ?? sentimentConfig['neutral'];
      return {
        time: p.time as Time,
        position: (p.sentiment === 'bullish' ? 'belowBar' : 'aboveBar') as 'aboveBar' | 'belowBar',
        color: cfg.color,
        shape: cfg.shape,
        text: ABBREV[p.type] ?? '•',
        size: 1,
      };
    });
  }
}
