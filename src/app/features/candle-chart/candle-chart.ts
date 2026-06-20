import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  effect,
  input,
} from '@angular/core';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  Time,
  CandlestickData,
  LineData,
  CandlestickSeries,
  LineSeries,
} from 'lightweight-charts';
import { TranslatePipe } from '@ngx-translate/core';
import { Candle } from '../../core/models/candle.model';
import { IndicatorResults } from '../../core/models/indicator.model';

@Component({
  selector: 'app-candle-chart',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './candle-chart.html',
  styleUrl: './candle-chart.css',
})
export class CandleChart implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer') chartContainer!: ElementRef<HTMLDivElement>;

  readonly candleData = input<Candle[]>([]);
  readonly indicators = input<IndicatorResults | null>(null);

  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<'Candlestick'> | null = null;
  private indicatorSeries: ISeriesApi<'Line'>[] = [];
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;

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
        vertLine: { color: '#3b82f6', style: 2, width: 1, labelBackgroundColor: '#3b82f6' },
        horzLine: { color: '#3b82f6', style: 2, width: 1, labelBackgroundColor: '#3b82f6' },
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
      this.addLineSeries(ind.sma20.values, '#3b82f6', 'SMA 20');
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
  }
}
