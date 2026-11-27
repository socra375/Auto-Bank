/** Today's date (YYYY-MM-DD) in the app timezone, America/Santo_Domingo. */
export function todayDR(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });
}

/** "2026-02-01" -> "01/02/2026" (dd/MM/yyyy). */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
