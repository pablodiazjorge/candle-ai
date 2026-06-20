import { Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TickerStore } from '../../core/state/ticker.store';
import { TranslatePipe } from '@ngx-translate/core';

const POPULAR_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'NFLX',
  'BTC-USD', 'ETH-USD', 'GC=F', 'CL=F', 'SI=F',
  '^GSPC', '^IXIC', '^DJI',
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
