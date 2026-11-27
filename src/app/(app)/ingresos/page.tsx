import type { Metadata } from "next";
import { MovementsView } from "@/components/finance/movements-view";
import type { SearchParams } from "@/components/finance/filters";
import { requireOwner } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Ingresos" };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  return (
    <MovementsView
      userId={userId} basePath="/ingresos" title="Ingresos" description="Dinero que entra a tus cuentas." fixedType="income"
      newLabel="Nuevo ingreso" sp={await searchParams}
    />
  );
}
