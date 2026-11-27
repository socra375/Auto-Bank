import type { Metadata } from "next";
import { MovementsView } from "@/components/finance/movements-view";
import type { SearchParams } from "@/components/finance/filters";
import { requireOwner } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Movimientos" };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  return (
    <MovementsView
      userId={userId} basePath="/movimientos" title="Movimientos" description="Todos tus ingresos, gastos, transferencias y ajustes. Los montos siempre se muestran en su propia moneda."
      newLabel="Nuevo movimiento" sp={await searchParams}
    />
  );
}
