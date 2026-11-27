import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure, Field, inputCls, Options } from "@/components/ui/fields";
import { createCategoryAction, seedCategoriesAction, setCategoryStatusAction, updateCategoryAction } from "@/lib/actions/categories";
import { requireOwner } from "@/lib/auth/guard";
import { safe } from "@/lib/safe";
import { listCategories, type Category } from "@/server/categories";
import { getExecutor } from "@/server/db";

export const metadata: Metadata = { title: "Categorías" };

function Row({ c }: { c: Category }) {
  const archived = c.status === "archived";
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <span className="flex items-center gap-2 text-sm font-medium">
        {c.color && <span aria-hidden className="inline-block size-3 rounded-full border border-border" style={{ background: c.color }} />}
        {c.name}{archived && <span className="text-xs font-normal text-muted">(archivada)</span>}
      </span>
      <div className="flex flex-wrap items-start gap-2">
        <Disclosure summary="Editar" className="min-w-56">
          <ActionForm action={updateCategoryAction} submit="Guardar">
            <input type="hidden" name="id" value={c.id} />
            <Field label="Nombre" id={`cn-${c.id}`}><input id={`cn-${c.id}`} name="name" required maxLength={80} defaultValue={c.name} className={inputCls} /></Field>
            <Field label="Color (opcional)" id={`cc-${c.id}`}><input id={`cc-${c.id}`} name="color" type="text" placeholder="#1769aa" pattern="#[0-9a-fA-F]{6}" defaultValue={c.color ?? ""} className={inputCls} /></Field>
          </ActionForm>
        </Disclosure>
        <ActionForm action={setCategoryStatusAction} submit={archived ? "Reactivar" : "Archivar"} variant="ghost">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="status" value={archived ? "active" : "archived"} />
        </ActionForm>
      </div>
    </li>
  );
}

export default async function Page() {
  const userId = await requireOwner();
  const res = await safe(listCategories(getExecutor(), userId));
  if (res.failed) {
    return (<><PageHeader title="Categorías" /><ErrorState title="No se pudieron cargar las categorías" description="Inténtalo de nuevo en unos segundos." /></>);
  }
  const cats = res.data;
  return (
    <>
      <PageHeader title="Categorías" description="Clasifican tus ingresos y gastos. Se archivan, nunca se borran." />
      {cats.length === 0 && (
        <div className="mb-6 card">
          <p className="mb-3 text-sm">Aún no tienes categorías. Puedes cargar un conjunto sugerido (se puede ejecutar varias veces sin duplicar) o crear las tuyas.</p>
          <ActionForm action={seedCategoriesAction} submit="Cargar categorías sugeridas" />
        </div>
      )}
      <Disclosure summary="Nueva categoría" className="mb-6">
        <ActionForm action={createCategoryAction} submit="Crear categoría" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nombre" id="cat-name"><input id="cat-name" name="name" required maxLength={80} className={inputCls} /></Field>
            <Field label="Tipo" id="cat-kind">
              <select id="cat-kind" name="kind" defaultValue="expense" className={inputCls}>
                <Options items={[{ value: "expense", label: "Gasto" }, { value: "income", label: "Ingreso" }]} />
              </select>
            </Field>
            <Field label="Color (opcional)" id="cat-color"><input id="cat-color" name="color" placeholder="#1769aa" pattern="#[0-9a-fA-F]{6}" className={inputCls} /></Field>
          </div>
        </ActionForm>
      </Disclosure>
      {cats.length === 0 ? (
        <EmptyState title="Sin categorías" description="Carga las sugeridas o crea una nueva." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["income", "expense"] as const).map((kind) => (
            <section key={kind} aria-labelledby={`k-${kind}`} className="card">
              <h2 id={`k-${kind}`} className="mb-1 section-title">{kind === "income" ? "Ingresos" : "Gastos"}</h2>
              <ul className="divide-y divide-border">{cats.filter((c) => c.kind === kind).map((c) => <Row key={c.id} c={c} />)}</ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
