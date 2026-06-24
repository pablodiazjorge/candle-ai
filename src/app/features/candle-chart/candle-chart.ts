import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  effect,
  input,
  inject,
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
        if (visibleTypes.size > 0) {
          const filtered = pat.filter((p) => visibleTypes.has(p.type));
          this.updatePatternMarkers(filtered);
        } else {
          this.markersPlugin.setMarkers([]);
        }
      }
    });
  }

  ngAfterViewInit(): void {
    this.initChart();
    if (this.candleData().length > 0) {
      this.updateCandleSeries(this.candleData());
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    this.chart?.remove();
  }

  private initChart(): void {
    const container = this.chartContainer.nativeElement;

    this.chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1117' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e2130' },
        horzLines: { color: '#1e2130' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#787878', style: 2, width: 1, labelBackgroundColor: '#787878' },
        horzLine: { color: '#787878', style: 2, width: 1, labelBackgroundColor: '#787878' },
      },
      rightPriceScale: {
        borderColor: '#2a2e44',
      },
      timeScale: {
        borderColor: '#2a2e44',
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
    if (ind.sma20) {
      this.addLineSeries(ind.sma20.values, '#b8b8b8', 'SMA 20');
    }
    // SMA 50
    if (ind.sma50) {
      this.addLineSeries(ind.sma50.values, '#a855f7', 'SMA 50');
    }
    // SMA 200
    if (ind.sma200) {
      this.addLineSeries(ind.sma200.values, '#eab308', 'SMA 200');
    }
    // EMA 9
    if (ind.ema9) {
      this.addLineSeries(ind.ema9.values, '#22c55e', 'EMA 9');
    }
    // EMA 21
    if (ind.ema21) {
      this.addLineSeries(ind.ema21.values, '#ef4444', 'EMA 21');
    }
    // Bollinger Bands
    if (ind.bb) {
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
    if (ind.rsi) {
      this.renderRsi(ind.rsi.values);
    }

    // MACD (on its own price scale in same pane)
    if (ind.macd) {
      this.renderMacd(ind.macd.values);
    }
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

  /** Render pattern markers on the candlestick series */
  private updatePatternMarkers(patterns: DetectedPattern[]): void {
    if (!this.markersPlugin) return;

    if (patterns.length === 0) {
      this.markersPlugin.setMarkers([]);
      return;
    }

    const sentimentConfig: Record<string, { color: string; shape: 'arrowUp' | 'arrowDown' | 'circle' }> = {
      bullish: { color: '#22c55e', shape: 'arrowUp' },
      bearish: { color: '#ef4444', shape: 'arrowDown' },
      neutral: { color: '#f59e0b', shape: 'circle' },
    };

    const markers = patterns.map((p) => {
      const cfg = sentimentConfig[p.sentiment] ?? sentimentConfig['neutral'];
      return {
        time: p.time as Time,
        position: (p.sentiment === 'bullish' ? 'belowBar' : 'aboveBar') as 'aboveBar' | 'belowBar',
        color: cfg.color,
        shape: cfg.shape,
        text: p.type.replace(/_/g, ' '),
        size: 2,
      };
    });

    this.markersPlugin.setMarkers(markers);
  }
}
