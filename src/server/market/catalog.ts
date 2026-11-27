import type { Category } from "./types";

/**
 * The ONE place that maps display names to provider symbols. Static; it does NOT say which symbols a provider plan supports:
 * whatever the provider answers (or refuses) decides the status per symbol.
 * Provider symbols below are Twelve Data's naming and are UNVERIFIED against the live API (no key/network when written);
 * a wrong symbol simply comes back 'unavailable' (symbol_not_found), it is never replaced by another one.
 */
export interface CatalogItem { symbol: string; name: string; category: Category }

export const CATEGORY_LABEL: Record<Category, string> = {
  commodities: "Materias primas", indices: "Índices", stocks: "Acciones", forex: "Forex", crypto: "Cripto",
};

export const CATALOG: readonly CatalogItem[] = [
  { symbol: "WTI/USD", name: "WTI Crude Oil", category: "commodities" },
  { symbol: "XBR/USD", name: "Brent Crude Oil", category: "commodities" },
  { symbol: "XAU/USD", name: "Gold", category: "commodities" },
  { symbol: "XAG/USD", name: "Silver", category: "commodities" },
  { symbol: "NG/USD", name: "Natural Gas", category: "commodities" },
  { symbol: "SPX", name: "S&P 500", category: "indices" },
  { symbol: "NDX", name: "NASDAQ 100", category: "indices" },
  { symbol: "DJI", name: "Dow Jones", category: "indices" },
  { symbol: "RUT", name: "Russell 2000", category: "indices" },
  { symbol: "DAX", name: "DAX 40", category: "indices" },
  { symbol: "AAPL", name: "Apple", category: "stocks" },
  { symbol: "MSFT", name: "Microsoft", category: "stocks" },
  { symbol: "NVDA", name: "NVIDIA", category: "stocks" },
  { symbol: "AMZN", name: "Amazon", category: "stocks" },
  { symbol: "TSLA", name: "Tesla", category: "stocks" },
  { symbol: "EUR/USD", name: "EUR/USD", category: "forex" },
  { symbol: "GBP/USD", name: "GBP/USD", category: "forex" },
  { symbol: "USD/JPY", name: "USD/JPY", category: "forex" },
  { symbol: "BTC/USD", name: "Bitcoin", category: "crypto" },
  { symbol: "ETH/USD", name: "Ethereum", category: "crypto" },
];

export const catalogByCategory = (c: Category) => CATALOG.filter((i) => i.category === c);
export const catalogName = (symbol: string) => CATALOG.find((i) => i.symbol === symbol)?.name ?? null;
