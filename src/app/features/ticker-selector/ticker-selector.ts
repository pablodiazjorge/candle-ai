import { Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TickerStore } from '../../core/state/ticker.store';
import { TranslatePipe } from '@ngx-translate/core';

const POPULAR_SYMBOLS = [
  // Indices
  '^GSPC', '^IXIC', '^DJI', '^RUT', '^VIX', '^FTSE', '^N225', '^HSI',
  // US ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLE', 'XLK', 'XLV',
  'ARKK', 'SOXX', 'SMH', 'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'HYG', 'LQD',
  'EEM', 'EFA', 'EWJ', 'FXI', 'GDX', 'XBI', 'XRT', 'IBB', 'TAN', 'ICLN',
  // Magnificent 7 + tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  // More US stocks
  'NFLX', 'AMD', 'INTC', 'BA', 'JPM', 'GS', 'BAC', 'WMT', 'COST', 'DIS',
  'UBER', 'PYPL', 'ADBE', 'CRM', 'ORCL', 'IBM', 'QCOM', 'TXN', 'AVGO',
  'LLY', 'UNH', 'JNJ', 'PFE', 'XOM', 'CVX', 'CAT', 'GE', 'F', 'PLTR',
  'HOOD', 'SNAP', 'RBLX', 'COIN', 'MSTR', 'RDDT', 'ARM', 'SNOW', 'DDOG',
  // Crypto
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD', 'XRP-USD', 'ADA-USD',
  'AVAX-USD', 'DOT-USD', 'LINK-USD', 'MATIC-USD', 'SHIB-USD', 'PEPE-USD',
  // Commodities
  'GC=F', 'CL=F', 'SI=F', 'NG=F', 'HG=F', 'PL=F', 'ZC=F', 'ZS=F', 'ZW=F',
  // Forex
  'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCHF=X', 'AUDUSD=X', 'USDCAD=X',
  'NZDUSD=X', 'EURGBP=X', 'EURJPY=X', 'GBPJPY=X',
  // International
  'BABA', 'TSM', 'NIO', 'VALE', 'SHEL', 'BP', 'NVS', 'TM', 'SONY',
  'RY', 'TD', 'BHP', 'RIO', 'AZN', 'HSBC', 'SAP', 'ASML', 'MC.PA',
];

@Component({
  selector: 'app-ticker-selector',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './ticker-selector.html',
  styleUrl: './ticker-selector.css',
})
export class TickerSelector {
  readonly store = inject(TickerStore);
  readonly tickerSelected = output<string>();

  searchQuery = signal('');
  filteredSymbols = signal<string[]>([]);
  isDropdownOpen = signal(false);

  onInputChange(query: string): void {
    this.searchQuery.set(query);
    const upper = query.toUpperCase();
    if (upper.length > 0) {
      this.filteredSymbols.set(
        POPULAR_SYMBOLS.filter((s) => s.includes(upper)).slice(0, 8),
      );
      this.isDropdownOpen.set(true);
    } else {
      this.filteredSymbols.set(POPULAR_SYMBOLS.slice(0, 8));
      this.isDropdownOpen.set(true);
    }
  }

  selectSymbol(symbol: string): void {
    this.store.selectTicker(symbol);
    this.searchQuery.set(symbol);
    this.isDropdownOpen.set(false);
    this.tickerSelected.emit(symbol);

    // Add to watchlist if not already
    if (!this.store.watchlist().includes(symbol)) {
      this.store.addToWatchlist(symbol);
    }
  }

  onFocus(): void {
    if (this.searchQuery().length === 0) {
      this.filteredSymbols.set(POPULAR_SYMBOLS.slice(0, 8));
    }
    this.isDropdownOpen.set(true);
  }

  onBlur(): void {
    // Delay to allow click on dropdown items
    setTimeout(() => this.isDropdownOpen.set(false), 200);
  }
}
