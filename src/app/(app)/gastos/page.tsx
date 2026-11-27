import type { Metadata } from "next";
import { MovementsView } from "@/components/finance/movements-view";
import type { SearchParams } from "@/components/finance/filters";
import { requireOwner } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Gastos" };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  return (
    <MovementsView
      userId={userId} basePath="/gastos" title="Gastos" description="Dinero que sale de tus cuentas." fixedType="expense"
      newLabel="Nuevo gasto" sp={await searchParams}
    />
  );
}
