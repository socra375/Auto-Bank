import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/states/states";
import { PageHeader } from "@/components/shell/page-header";
import { Disclosure } from "@/components/ui/fields";
import { createMovementAction } from "@/lib/actions/movements";
import { todayDR } from "@/lib/dates";
import { safe } from "@/lib/safe";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { getExecutor } from "@/server/db";
import { listMovements } from "@/server/ledger";
import { FiltersForm, Pagination, parseFilters, type SearchParams } from "./filters";
import { MovementForm, type MovementType } from "./movement-form";
import { MovementList } from "./movement-list";

/**
 * Shared by /movimientos, /ingresos, /gastos and /transferencias (same data, filtered by type).
 * `userId` MUST come from requireOwner() in the calling page; every query below is scoped by it.
 */
export async function MovementsView({
  userId, basePath, title, description, fixedType, newLabel, sp,
}: {
  userId: string; basePath: string; title: string; description: string;
  fixedType?: MovementType; newLabel: string; sp: SearchParams;
}) {
  const ex = getExecutor();
  const filters = parseFilters(sp, fixedType ? [fixedType] : undefined);
  const [accounts, categories, list] = await Promise.all([
    safe(listAccounts(ex, userId)), safe(listCategories(ex, userId)), safe(listMovements(ex, userId, filters)),
  ]);
  if (accounts.failed || categories.failed || list.failed) {
    return (<><PageHeader title={title} description={description} /><ErrorState title="No se pudieron cargar los movimientos" description="Inténtalo de nuevo en unos segundos." /></>);
  }
  const active = accounts.data.filter((a) => a.status === "active");
  const cats = categories.data.filter((c) => c.status === "active");
  const missingCategories = (fixedType === "income" || fixedType === "expense") && !cats.some((c) => c.kind === fixedType);
  const formKey = crypto.randomUUID(); // also the idempotency key: a new key per rendered form
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="mb-4">
        {active.length === 0 ? (
          <EmptyState title="Primero crea una cuenta" description="Necesitas al menos una cuenta activa para registrar movimientos." />
        ) : missingCategories ? (
          <p className="card text-sm">
            Aún no tienes categorías de {fixedType === "income" ? "ingresos" : "gastos"}. <Link href="/categorias" className="text-primary underline">Crea o carga categorías</Link>.
          </p>
        ) : (
          <Disclosure summary={newLabel}>
            <MovementForm
              key={formKey}
              action={createMovementAction} type={fixedType} today={todayDR()} idempotencyKey={formKey}
              accounts={active.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
              categories={cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
              idp={`new-${fixedType ?? "any"}`}
            />
          </Disclosure>
        )}
      </div>
      <FiltersForm
        action={basePath} sp={sp} showType={!fixedType}
        accounts={accounts.data.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.data.filter((c) => !fixedType || c.kind === fixedType).map((c) => ({ id: c.id, name: c.name }))}
      />
      <MovementList items={list.data.items} />
      <Pagination basePath={basePath} sp={sp} page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} />
    </>
  );
}
