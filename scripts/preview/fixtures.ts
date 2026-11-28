/* Preview-only fixture data. Not imported by the app. All amounts are minor units (centavos/cents). */
import type { MovementRow } from "@/server/ledger";
import type { Overview } from "@/server/reports";
import type { AccountWithBalance } from "@/server/accounts";
import type { LoanRow } from "@/server/loans";
import type { AssetRow, NetWorth, NetWorthLine } from "@/server/assets";
import type { MarketRow } from "@/server/market/service";
import type { Proposal } from "@/server/eddie/proposals";
import type { StoredMessage } from "@/server/eddie/messages";

export const TODAY = "2026-11-27";
const D = (n: number) => BigInt(Math.round(n * 100));

const line = (accounts: number, assets: number, payables: number, receivables: number): NetWorthLine => {
  const gross = D(accounts) + D(assets);
  return { accounts: D(accounts), assets: D(assets), grossAssets: gross, payables: D(payables), receivables: D(receivables), net: gross - D(payables) + D(receivables) };
};
export const netWorth: NetWorth = {
  asOf: TODAY,
  byCurrency: { DOP: line(486_320.55, 3_450_000, 120_000, 45_000), USD: line(3_850.2, 18_500, 0, 1_200) },
  consolidated: {
    currency: "DOP",
    figures: {
      grossAssets: { status: "ok", currency: "DOP", totalMinor: D(4_950_000), rates: [{ from: "USD", base: "DOP", rate: "59.25", date: "2026-11-20" }] },
      payables: { status: "ok", currency: "DOP", totalMinor: D(120_000), rates: [] },
      receivables: { status: "ok", currency: "DOP", totalMinor: D(116_100), rates: [{ from: "USD", base: "DOP", rate: "59.25", date: "2026-11-20" }] },
      net: { status: "ok", currency: "DOP", totalMinor: D(4_946_100), rates: [{ from: "USD", base: "DOP", rate: "59.25", date: "2026-11-20" }] },
    },
  },
};

const leg = (accountName: string, currency: "DOP" | "USD", kind: MovementRow["legs"][number]["kind"], amount: number) =>
  ({ accountId: accountName, accountName, currency, kind, amountMinor: D(amount) });
let n = 0;
const mv = (o: Partial<MovementRow> & Pick<MovementRow, "type" | "date" | "description" | "legs">): MovementRow => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, notes: null, status: "posted", categoryId: null, categoryName: null,
  reversesId: null, replacedById: null, fxRate: null, createdAt: "", ...o,
});
export const movements: MovementRow[] = [
  mv({ type: "expense", date: "2026-11-26", description: "Supermercado Nacional", categoryName: "Supermercado", legs: [leg("Banco Popular", "DOP", "expense", -4_825.4)] }),
  mv({ type: "income", date: "2026-11-25", description: "Nómina noviembre (1ra quincena)", categoryName: "Salario", legs: [leg("Banco Popular", "DOP", "income", 92_500)] }),
  mv({ type: "transfer", date: "2026-11-24", description: "Cambio de divisas", legs: [leg("Banco Popular", "DOP", "transfer", -59_250), leg("Cuenta USD", "USD", "transfer", 1_000)] }),
  mv({ type: "expense", date: "2026-11-23", description: "Suscripción streaming", categoryName: "Entretenimiento", legs: [leg("Tarjeta digital", "USD", "expense", -15.99)] }),
  mv({ type: "expense", date: "2026-11-21", description: "Combustible y peaje", categoryName: "Transporte", legs: [leg("Efectivo", "DOP", "expense", -3_200)] }),
  mv({ type: "income", date: "2026-11-20", description: "Freelance diseño web", categoryName: "Servicios", legs: [leg("Cuenta USD", "USD", "income", 650)] }),
  mv({ type: "expense", date: "2026-11-18", description: "Alquiler de apartamento con descripción larga para probar el truncado", categoryName: "Vivienda", status: "reversed", replacedById: "x", legs: [leg("Banco Popular", "DOP", "expense", -28_000)] }),
  mv({ type: "adjustment", date: "2026-11-15", description: "Ajuste de saldo por conciliación", legs: [leg("Efectivo", "DOP", "adjustment", 150)] }),
];

export const accounts: AccountWithBalance[] = [
  { id: "a1", name: "Banco Popular", type: "bank", currency: "DOP", description: "Cuenta de nómina", status: "active", openingDate: "2026-01-01", openingBalanceMinor: D(50_000), entriesMinor: D(380_420.55), balanceMinor: D(430_420.55) },
  { id: "a2", name: "Efectivo", type: "cash", currency: "DOP", description: null, status: "active", openingDate: "2026-01-01", openingBalanceMinor: D(5_000), entriesMinor: D(900), balanceMinor: D(5_900) },
  { id: "a3", name: "Ahorro metas", type: "savings", currency: "DOP", description: "Fondo de emergencia", status: "active", openingDate: "2026-02-01", openingBalanceMinor: D(50_000), entriesMinor: D(0), balanceMinor: D(50_000) },
  { id: "a4", name: "Cuenta USD", type: "bank", currency: "USD", description: null, status: "active", openingDate: "2026-01-01", openingBalanceMinor: D(2_000), entriesMinor: D(1_650.2), balanceMinor: D(3_650.2) },
  { id: "a5", name: "Tarjeta digital", type: "digital", currency: "USD", description: null, status: "active", openingDate: "2026-03-01", openingBalanceMinor: D(300), entriesMinor: D(-100), balanceMinor: D(200) },
  { id: "a7", name: "Ahorro en dólares para el viaje de fin de año con la familia", type: "savings", currency: "USD", description: null, status: "active", openingDate: "2026-04-01", openingBalanceMinor: D(1_200), entriesMinor: D(300), balanceMinor: D(1_500) },
  { id: "a8", name: "Billetera móvil", type: "digital", currency: "DOP", description: "Pagos del día a día", status: "active", openingDate: "2026-05-01", openingBalanceMinor: D(2_000), entriesMinor: D(-2_500), balanceMinor: D(-500) },
  { id: "a9", name: "Caja chica USD", type: "cash", currency: "USD", description: null, status: "active", openingDate: "2026-05-01", openingBalanceMinor: D(120), entriesMinor: D(0), balanceMinor: D(120) },
  { id: "a6", name: "Cuenta antigua", type: "bank", currency: "DOP", description: null, status: "archived", openingDate: "2025-01-01", openingBalanceMinor: D(0), entriesMinor: D(0), balanceMinor: D(0) },
];

const loan = (o: Partial<LoanRow> & Pick<LoanRow, "id" | "counterparty" | "direction" | "currency" | "principalMinor" | "outstandingMinor" | "status">): LoanRow => ({
  principalPaidMinor: 0n, interestPaidMinor: 0n, startDate: "2026-09-01", dueDate: null, interestRatePct: null, accountId: "a1", accountName: "Banco Popular",
  funded: true, notes: null, createdAt: "", cancelledAt: null, ...o,
});
export const loans: LoanRow[] = [
  loan({ id: "l1", counterparty: "María Fernández", direction: "receivable", currency: "DOP", principalMinor: D(45_000), outstandingMinor: D(45_000), status: "vencido", dueDate: "2026-11-10" }),
  loan({ id: "l2", counterparty: "Carlos Peña", direction: "receivable", currency: "USD", principalMinor: D(1_500), principalPaidMinor: D(300), outstandingMinor: D(1_200), status: "parcial", dueDate: "2026-12-15" }),
  loan({ id: "l3", counterparty: "Banco BHD — préstamo personal", direction: "payable", currency: "DOP", principalMinor: D(120_000), outstandingMinor: D(120_000), status: "pendiente", dueDate: "2026-12-05" }),
  loan({ id: "l4", counterparty: "Luis Santana", direction: "receivable", currency: "DOP", principalMinor: D(10_000), principalPaidMinor: D(10_000), outstandingMinor: 0n, status: "liquidado" }),
];

export const assets: AssetRow[] = [
  { id: "s1", name: "Apartamento Piantini", type: "real_estate", currency: "DOP", description: null, status: "active", acquiredOn: "2022-05-01", acquisitionCostMinor: D(3_000_000), disposedOn: null, currentValueMinor: D(3_450_000), currentValuedOn: "2026-10-31" },
  { id: "s2", name: "Toyota Corolla 2020", type: "vehicle", currency: "DOP", description: null, status: "active", acquiredOn: null, acquisitionCostMinor: null, disposedOn: null, currentValueMinor: D(1_050_000), currentValuedOn: "2026-09-30" },
  { id: "s3", name: "MacBook Pro", type: "technology", currency: "USD", description: null, status: "active", acquiredOn: null, acquisitionCostMinor: null, disposedOn: null, currentValueMinor: D(1_800), currentValuedOn: "2026-10-01" },
  { id: "s4", name: "Moto vendida", type: "vehicle", currency: "DOP", description: null, status: "disposed", acquiredOn: null, acquisitionCostMinor: null, disposedOn: "2026-08-12", currentValueMinor: null, currentValuedOn: null },
];

export const evolution = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 11 + i, 0)).toISOString().slice(0, 10);
  return { date: d, byCurrency: { DOP: line(380_000 + i * 11_500 + (i % 3) * 4_000, 3_300_000 + i * 12_000, 120_000, 45_000), USD: line(2_800 + i * 95 + (i % 4) * 40, 1_800, 0, 1_200) } };
});

const series = (cur: "DOP" | "USD", k: number) => Array.from({ length: 10 }, (_, i) => {
  const inc = D((cur === "DOP" ? 9_000 : 150) * k * (1 + ((i * 7) % 5) / 6));
  const exp = D((cur === "DOP" ? 6_500 : 90) * k * (1 + ((i * 3) % 4) / 5));
  const day = String(18 + i).padStart(2, "0");
  return { bucket: i < 10 ? `2026-11-${day > "27" ? "27" : day}` : "", incomeMinor: i % 4 === 3 ? 0n : inc, expenseMinor: exp, netMinor: (i % 4 === 3 ? 0n : inc) - exp };
}).filter((p, i, a) => a.findIndex((x) => x.bucket === p.bucket) === i);
const flowOf = (cur: "DOP" | "USD", k: number) => {
  const s = series(cur, k);
  const inc = s.reduce((a, p) => a + p.incomeMinor, 0n), exp = s.reduce((a, p) => a + p.expenseMinor, 0n);
  return { currency: cur, series: s, incomeMinor: inc, expenseMinor: exp, netMinor: inc - exp };
};
export const flow = { range: { from: "2026-10-29", to: TODAY }, granularity: "day" as const, byCurrency: [flowOf("DOP", 1), flowOf("USD", 1)] };

export const distribution = {
  asOf: TODAY,
  rows: [
    { accountId: "a1", name: "Banco Popular", type: "bank" as const, currency: "DOP" as const, status: "active" as const, balanceMinor: D(430_420.55), shareOfActivePermille: 885 },
    { accountId: "a3", name: "Ahorro metas", type: "savings" as const, currency: "DOP" as const, status: "active" as const, balanceMinor: D(50_000), shareOfActivePermille: 103 },
    { accountId: "a2", name: "Efectivo", type: "cash" as const, currency: "DOP" as const, status: "active" as const, balanceMinor: D(5_900), shareOfActivePermille: 12 },
    { accountId: "a4", name: "Cuenta USD", type: "bank" as const, currency: "USD" as const, status: "active" as const, balanceMinor: D(3_650.2), shareOfActivePermille: 948 },
    { accountId: "a5", name: "Tarjeta digital", type: "digital" as const, currency: "USD" as const, status: "active" as const, balanceMinor: D(200), shareOfActivePermille: 52 },
  ],
  activeTotals: { DOP: D(486_320.55), USD: D(3_850.2) },
};

export const overview: Overview = {
  period: { key: "30d", from: "2026-10-29", to: TODAY, granularity: "day" },
  currencies: ["DOP", "USD"], netWorth, disponible: { DOP: D(486_320.55), USD: D(3_850.2) },
  loans: { receivable: { DOP: D(45_000), USD: D(1_200) }, payable: { DOP: D(120_000), USD: 0n }, interestCollected: { DOP: D(1_500), USD: 0n }, interestPaid: { DOP: D(2_400), USD: 0n } } as Overview["loans"],
  flow, distribution, due: [loans[0], loans[2], loans[1]], recent: movements.slice(0, 5),
  quickLinks: [{ href: "/ingresos", label: "Nuevo ingreso" }, { href: "/gastos", label: "Nuevo gasto" }, { href: "/transferencias", label: "Nueva transferencia" }, { href: "/prestamos", label: "Registrar pago de préstamo" }] as unknown as Overview["quickLinks"],
};

const q = (symbol: string, o: Partial<MarketRow["quote"]>): MarketRow["quote"] => ({
  symbol, status: "realtime", price: null, change: null, changePct: null, open: null, high: null, low: null, volume: null, currency: "USD",
  providerTs: "2026-11-27T15:42:10Z", fetchedAt: "2026-11-27T15:42:30Z", provider: "twelvedata", reason: null, detail: null, ...o,
});
export const marketRows: MarketRow[] = [
  { symbol: "XAU/USD", name: "Oro", favorite: true, quote: q("XAU/USD", { price: 2634.55, change: 12.4, changePct: 0.47, high: 2641.1, low: 2618.3, volume: null }) },
  { symbol: "WTI/USD", name: "Petróleo WTI", favorite: false, quote: q("WTI/USD", { status: "delayed", price: 71.82, change: -0.93, changePct: -1.28, high: 73.1, low: 71.2, volume: 182_400, providerTs: "2026-11-27T15:27:00Z" }) },
  { symbol: "AAPL", name: "Apple Inc.", favorite: true, quote: q("AAPL", { price: 228.14, change: 1.05, changePct: 0.46, high: 229.5, low: 226.9, volume: 41_300_000 }) },
  { symbol: "TSLA", name: "Tesla", favorite: false, quote: q("TSLA", { price: 341.9, change: -8.6, changePct: -2.45, high: 352.2, low: 339.7, volume: 88_100_000 }) },
  { symbol: "BTC/USD", name: "Bitcoin", favorite: false, quote: q("BTC/USD", { status: "unavailable", reason: "rate_limited" }) },
];

export const proposal: Proposal = {
  id: "p1", kind: "expense", status: "pending", createdAt: "2026-11-27T15:00:00Z", expiresAt: "2026-11-27T16:00:00Z", resultTxnId: null,
  preview: { type: "expense", date: "2026-11-27", description: "Almuerzo con el equipo", notes: null, category: "Restaurantes", fxRate: null, text: "",
    legs: [{ account: "Banco Popular", currency: "DOP", amountMinor: "-185000", balanceBeforeMinor: "43042055", balanceAfterMinor: "42857055" }] },
};
export const eddieMessages: StoredMessage[] = [
  { id: "1", role: "user", parts: [{ type: "text", text: "Registra un gasto de RD$1,850 en restaurantes, almuerzo con el equipo." }] },
  { id: "2", role: "assistant", parts: [{ type: "text", text: "Listo, preparé la propuesta. Revísala y confírmala si es correcta." }, { type: "proposal", proposalId: "p1" }] },
] as unknown as StoredMessage[];
