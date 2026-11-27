import type { Metadata } from "next";
import Link from "next/link";
import type { SearchParams } from "@/components/finance/filters";
import { OverviewView } from "@/components/reports/overview";
import { PillNav } from "@/components/reports/parts";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/states/states";
import { requireOwner } from "@/lib/auth/guard";
import { CURRENCIES, isCurrency } from "@/lib/money";
import { safe } from "@/lib/safe";
import { getExecutor } from "@/server/db";
import { overviewData, PERIOD_LABEL, PERIODS, QUICK_LINKS, type PeriodKey } from "@/server/reports";

export const metadata: Metadata = { title: "Overview" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  const sp = await searchParams;
  const p = first(sp.periodo);
  const period: PeriodKey = (PERIODS as readonly string[]).includes(p ?? "") ? (p as PeriodKey) : "30d";
  const m = first(sp.moneda);
  const currency = m && isCurrency(m) ? m : undefined;
  const href = (o: { periodo?: string; moneda?: string }) => {
    const qs = new URLSearchParams({ periodo: o.periodo ?? period });
    const mo = "moneda" in o ? o.moneda : currency;
    if (mo) qs.set("moneda", mo);
    return `/overview?${qs}`;
  };

  const res = await safe(overviewData(getExecutor(), userId, { period, currency }));
  return (
    <>
      <PageHeader title="Overview" description="Tu situación financiera de un vistazo. Cada moneda se calcula por separado." />
      <div className="mb-4 space-y-2">
        <PillNav label="Período" items={PERIODS.map((k) => ({ href: href({ periodo: k }), text: PERIOD_LABEL[k], active: k === period }))} />
        <PillNav label="Moneda" items={[{ href: href({ moneda: "" }), text: "Todas", active: !currency }, ...CURRENCIES.map((c) => ({ href: href({ moneda: c }), text: c, active: c === currency }))]} />
      </div>
      <nav aria-label="Acciones rápidas" className="mb-6 flex flex-wrap gap-2">
        {QUICK_LINKS.map((q) => <Link key={q.href} href={q.href} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white">{q.label}</Link>)}
      </nav>
      {res.failed
        ? <ErrorState title="No se pudo cargar el resumen" description="Inténtalo de nuevo en unos segundos." />
        : <OverviewView d={res.data} />}
    </>
  );
}
