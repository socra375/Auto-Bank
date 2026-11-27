import type { Metadata } from "next";
import { MovementsView } from "@/components/finance/movements-view";
import type { SearchParams } from "@/components/finance/filters";
import { requireOwner } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Transferencias" };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  return (
    <MovementsView
      userId={userId} basePath="/transferencias" title="Transferencias" description="Movimientos entre tus cuentas; no cuentan como ingreso ni gasto." fixedType="transfer"
      newLabel="Nueva transferencia" sp={await searchParams}
    />
  );
}
