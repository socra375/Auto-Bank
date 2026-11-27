// Money is always bigint minor units (centavos/cents) tagged with a currency.
// Mixed currencies are never summed.

export const CURRENCIES = ["DOP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Money = { readonly minor: bigint; readonly currency: Currency };
export type TotalsByCurrency = Record<Currency, bigint>;

const SYMBOL: Record<Currency, string> = { DOP: "RD$", USD: "US$" };

const formatter = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

/** 123456n, "DOP" -> "RD$1,234.56" (negatives: "-RD$1,234.56"). */
export function formatMoney(minor: bigint, currency: Currency): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, "0");
  // Decimal string keeps full precision for amounts beyond Number.MAX_SAFE_INTEGER.
  const body = formatter.format(`${whole}.${cents}` as unknown as number);
  return `${negative ? "-" : ""}${SYMBOL[currency]}${body}`;
}

/** "1,234.56" -> 123456n. Rejects >2 decimals, signs and junk. */
export function parseMoney(input: string): bigint {
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) throw new Error(`Monto inválido: "${input}"`);
  const whole = BigInt(match[1].replaceAll(",", ""));
  const cents = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return whole * 100n + cents;
}

export function emptyTotals(): TotalsByCurrency {
  return { DOP: 0n, USD: 0n };
}

/** Sums per currency; the result is never a single number across currencies. */
export function sumByCurrency(items: readonly Money[]): TotalsByCurrency {
  const totals = emptyTotals();
  for (const item of items) totals[item.currency] += item.minor;
  return totals;
}

/** Adds two amounts of the same currency; throws on mixed currencies. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`No se pueden sumar ${a.currency} y ${b.currency}`);
  }
  return { minor: a.minor + b.minor, currency: a.currency };
}
