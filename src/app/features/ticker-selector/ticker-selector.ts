import { Component, inject, signal, output, computed } from '@angular/core';
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

  /** Watchlist management modal */
  readonly watchlistModalOpen = signal(false);
  readonly watchlistFilter = signal('');

  /** All symbols with their watchlist status */
  readonly allSymbolsWithStatus = computed(() => {
    const watchlist = this.store.watchlist();
    const filter = this.watchlistFilter().toUpperCase();
    const symbols = filter
      ? POPULAR_SYMBOLS.filter((s) => s.includes(filter))
      : POPULAR_SYMBOLS;
    return symbols.map((s) => ({
      symbol: s,
      inWatchlist: watchlist.includes(s),
    }));
  });

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

  /** Add a symbol to watchlist without selecting it */
  addToWatchlist(symbol: string): void {
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

  /* ─── Watchlist Modal ────────────────────────────────────────── */

  openWatchlistModal(): void {
    this.watchlistFilter.set('');
    this.watchlistModalOpen.set(true);
    setTimeout(() => {
      const firstCheckbox = document.querySelector<HTMLElement>('.watchlist-modal-content input[type="checkbox"]');
      firstCheckbox?.focus();
    });
  }

  closeWatchlistModal(): void {
    this.watchlistModalOpen.set(false);
    setTimeout(() => {
      const addBtn = document.querySelector<HTMLElement>('.watchlist-add-btn');
      addBtn?.focus();
    });
  }

  toggleWatchlistSymbol(symbol: string): void {
    if (this.store.watchlist().includes(symbol)) {
      this.store.removeFromWatchlist(symbol);
    } else {
      this.store.addToWatchlist(symbol);
    }
  }

  selectAllWatchlist(): void {
    for (const s of this.allSymbolsWithStatus()) {
      if (!s.inWatchlist) {
        this.store.addToWatchlist(s.symbol);
      }
    }
  }

  deselectAllWatchlist(): void {
    for (const s of this.allSymbolsWithStatus()) {
      if (s.inWatchlist) {
        this.store.removeFromWatchlist(s.symbol);
      }
    }
  }

  onWatchlistModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeWatchlistModal();
    }
  }
}
