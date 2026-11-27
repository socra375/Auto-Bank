import { requireOwner } from "@/lib/auth/guard";
import { getExecutor } from "@/server/db";
import { buildReportCsv } from "@/server/export";
import { parseReportQuery, REPORT_KEYS, type ReportKey } from "@/server/report-params";

export const dynamic = "force-dynamic";

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** GET /api/export/{movimientos|ingresos-gastos|flujo|balances|categorias|prestamos|patrimonio|comparacion}?from&to&moneda&cuenta&granularidad */
export async function GET(request: Request, ctx: { params: Promise<{ report: string }> }) {
  const userId = await requireOwner(); // FIRST: redirects (never reaches the data) unless the signed-in user is the owner
  const { report } = await ctx.params;
  if (report !== "movimientos" && !(REPORT_KEYS as readonly string[]).includes(report)) return text(404, "Reporte desconocido.");
  const sp = new URL(request.url).searchParams;
  const parsed = parseReportQuery((k) => sp.get(k) ?? undefined);
  if (!parsed.ok) return text(400, parsed.error);
  try {
    const { filename, csv, truncated } = await buildReportCsv(getExecutor(), userId, report as ReportKey | "movimientos", parsed.filters);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        ...(truncated ? { "x-export-truncated": "true" } : {}),
      },
    });
  } catch (e) {
    console.error("export failed", e);
    return text(500, "No se pudo generar el archivo. Inténtalo de nuevo.");
  }
}
