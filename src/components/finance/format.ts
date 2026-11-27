import { formatMoney, type Currency } from "@/lib/money";
import type { MovementRow } from "@/server/ledger";

export const TYPE_LABEL: Record<string, string> = {
  income: "Ingreso", expense: "Gasto", transfer: "Transferencia", adjustment: "Ajuste", reversal: "Reversa",
  loan_disbursement: "Préstamo otorgado", loan_proceeds: "Préstamo recibido", loan_collection: "Cobro de préstamo", loan_repayment: "Pago de préstamo",
};
export const ACCOUNT_TYPE_LABEL: Record<string, string> = { cash: "Efectivo", bank: "Banco", savings: "Ahorro", digital: "Digital" };

export function statusLabel(m: Pick<MovementRow, "status" | "replacedById">): string {
  return m.status === "posted" ? "Vigente" : m.replacedById ? "Corregido" : "Anulado";
}

/** 123456n -> "1234.56": the plain form the amount inputs/parseMoney accept. */
export function toInput(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  return `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** One-line summary per movement. Amounts stay in their own currency; nothing is converted or added. */
export function summarize(m: MovementRow): { amount: string; accounts: string; tone: "pos" | "neg" | "neutral" } {
  const legs = m.legs;
  if (m.type === "transfer" && legs.length === 2) {
    const out = legs.find((l) => l.amountMinor < 0n) ?? legs[0];
    const inn = legs.find((l) => l.amountMinor > 0n) ?? legs[1];
    const sameCur = out.currency === inn.currency;
    return {
      amount: sameCur ? formatMoney(-out.amountMinor, out.currency) : `${formatMoney(-out.amountMinor, out.currency)} → ${formatMoney(inn.amountMinor, inn.currency)}`,
      accounts: `${out.accountName} → ${inn.accountName}`,
      tone: "neutral",
    };
  }
  const l = legs[0];
  if (!l) return { amount: "—", accounts: "", tone: "neutral" };
  return { amount: formatMoney(l.amountMinor, l.currency as Currency), accounts: legs.map((x) => x.accountName).join(", "), tone: l.amountMinor >= 0n ? "pos" : "neg" };
}

export const toneCls = (t: "pos" | "neg" | "neutral") => (t === "pos" ? "text-positive" : t === "neg" ? "text-negative" : "text-text");

import type { MovementInitial } from "./movement-form";

/** Prefills the correction form from an existing posted movement. */
export function toInitial(m: MovementRow): MovementInitial | null {
  if (m.type !== "income" && m.type !== "expense" && m.type !== "transfer" && m.type !== "adjustment") return null;
  const t = m.type as MovementInitial["type"];
  const base = { type: t, date: m.date, description: m.description, notes: m.notes ?? undefined, categoryId: m.categoryId ?? undefined };
  if (m.type === "transfer") {
    const out = m.legs.find((l) => l.amountMinor < 0n);
    const inn = m.legs.find((l) => l.amountMinor > 0n);
    if (!out || !inn) return null;
    return { ...base, fromAccountId: out.accountId, toAccountId: inn.accountId, amount: toInput(out.amountMinor),
      amountIn: out.currency === inn.currency ? undefined : toInput(inn.amountMinor), fxRate: m.fxRate ?? undefined };
  }
  const l = m.legs[0];
  if (!l) return null;
  return { ...base, accountId: l.accountId, amount: toInput(l.amountMinor), direction: l.amountMinor >= 0n ? "increase" : "decrease" };
}
