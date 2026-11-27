/** Money cell: minor units written in MAJOR units with a dot ("-1234.50"), no symbol, no thousands separator. The currency goes in its own column. */
export type MoneyCell = { minor: bigint };
export type Cell = string | number | null | MoneyCell;

export const money = (minor: bigint): MoneyCell => ({ minor });

export function formatMajor(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** Text cells that a spreadsheet could read as a formula (= + - @ TAB CR, also after leading spaces) get a leading apostrophe. */
export function guardInjection(s: string): string {
  return /^[ ]*[=+\-@]|^[\t\r]/.test(s) ? `'${s}` : s;
}

/** RFC 4180: quote when the value has a comma, a quote, CR or LF; double inner quotes. */
export function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function cell(c: Cell): string {
  if (c === null) return "";
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  if (typeof c === "string") return quote(guardInjection(c));
  return formatMajor(c.minor); // numeric by construction: never needs the injection guard
}

export const BOM = "﻿";

/** UTF-8 CSV with BOM (Excel) and CRLF line endings. */
export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [headers.map((h) => quote(guardInjection(h))).join(","), ...rows.map((r) => r.map(cell).join(","))];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
