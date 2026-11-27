import Link from "next/link";
import { Field, inputCls, Options } from "@/components/ui/fields";
import { movementFiltersSchema, type MovementFilters } from "@/server/schemas";
import { TYPE_LABEL } from "./format";

export type SearchParams = { [key: string]: string | string[] | undefined };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** URL params -> validated filters. Invalid input is ignored rather than crashing the page. */
export function parseFilters(sp: SearchParams, fixedTypes?: MovementFilters["types"]): MovementFilters {
  const raw = {
    from: first(sp.from), to: first(sp.to), accountId: first(sp.cuenta), categoryId: first(sp.categoria),
    currency: first(sp.moneda), q: first(sp.q), status: first(sp.estado),
    types: fixedTypes ?? (first(sp.tipo) ? [first(sp.tipo)] : undefined),
    page: first(sp.page) ? Number(first(sp.page)) : 1,
  };
  const ok = movementFiltersSchema.safeParse(raw);
  return ok.success ? (raw as MovementFilters) : { types: fixedTypes };
}

export function FiltersForm({
  action, sp, accounts, categories, showType,
}: {
  action: string; sp: SearchParams; showType: boolean;
  accounts: { id: string; name: string }[]; categories: { id: string; name: string }[];
}) {
  const v = (k: string) => first(sp[k]) ?? "";
  return (
    <form method="get" action={action} className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Desde" id="f-from"><input id="f-from" name="from" type="date" defaultValue={v("from")} className={inputCls} /></Field>
      <Field label="Hasta" id="f-to"><input id="f-to" name="to" type="date" defaultValue={v("to")} className={inputCls} /></Field>
      {showType && (
        <Field label="Tipo" id="f-tipo">
          <select id="f-tipo" name="tipo" defaultValue={v("tipo")} className={inputCls}>
            <Options placeholder="Todos" items={["income", "expense", "transfer", "adjustment", "reversal"].map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
          </select>
        </Field>
      )}
      <Field label="Cuenta" id="f-cuenta">
        <select id="f-cuenta" name="cuenta" defaultValue={v("cuenta")} className={inputCls}>
          <Options placeholder="Todas" items={accounts.map((a) => ({ value: a.id, label: a.name }))} />
        </select>
      </Field>
      <Field label="Categoría" id="f-categoria">
        <select id="f-categoria" name="categoria" defaultValue={v("categoria")} className={inputCls}>
          <Options placeholder="Todas" items={categories.map((c) => ({ value: c.id, label: c.name }))} />
        </select>
      </Field>
      <Field label="Moneda" id="f-moneda">
        <select id="f-moneda" name="moneda" defaultValue={v("moneda")} className={inputCls}>
          <Options placeholder="Todas" items={[{ value: "DOP", label: "DOP" }, { value: "USD", label: "USD" }]} />
        </select>
      </Field>
      <Field label="Estado" id="f-estado">
        <select id="f-estado" name="estado" defaultValue={v("estado")} className={inputCls}>
          <Options placeholder="Todos" items={[{ value: "posted", label: "Vigentes" }, { value: "reversed", label: "Anulados / corregidos" }]} />
        </select>
      </Field>
      <Field label="Buscar" id="f-q"><input id="f-q" name="q" type="search" defaultValue={v("q")} placeholder="Descripción o notas" className={inputCls} /></Field>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
        <Link href={action} className="rounded-md border border-border px-4 py-2 text-sm">Limpiar</Link>
      </div>
    </form>
  );
}

export function Pagination({ basePath, sp, page, pageSize, total }: { basePath: string; sp: SearchParams; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (k !== "page" && first(val)) qs.set(k, first(val)!);
    qs.set("page", String(p));
    return `${basePath}?${qs}`;
  };
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted">{total} movimientos · página {page} de {pages}</span>
      <span className="flex gap-2">
        {page > 1 && <Link href={href(page - 1)} className="rounded-md border border-border px-3 py-1.5">Anterior</Link>}
        {page < pages && <Link href={href(page + 1)} className="rounded-md border border-border px-3 py-1.5">Siguiente</Link>}
      </span>
    </nav>
  );
}
