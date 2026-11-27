/** Today's date (YYYY-MM-DD) in the app timezone, America/Santo_Domingo. */
export function todayDR(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });
}

/** "2026-02-01" -> "01/02/2026" (dd/MM/yyyy). */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-03-31", -30 -> "2026-03-01". Calendar arithmetic in UTC on a plain date string (no timezone drift). */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
