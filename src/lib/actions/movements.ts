"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { correctMovement, createMovement, updateMovementMeta, voidMovement } from "@/server/ledger";
import { fields, guarded, type ActionState } from "./guarded";

const done = () => {
  for (const p of ["/movimientos", "/ingresos", "/gastos", "/transferencias", "/cuentas"]) revalidatePath(p);
};

export async function createMovementAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    const r = await createMovement(ex, u, fields(form) as never);
    done();
    return r.duplicate ? "Este movimiento ya estaba registrado." : "Movimiento registrado.";
  });
}

/** Financial edit: reversal + new transaction. Bound with the original id from the detail page. */
export async function correctMovementAction(id: string, _: ActionState, form: FormData) {
  const s = await guarded(async (u, ex) => {
    await correctMovement(ex, u, id, fields(form) as never);
    done();
  });
  if (s?.ok) redirect("/movimientos");
  return s;
}

export async function updateMovementMetaAction(id: string, _: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await updateMovementMeta(ex, u, id, fields(form) as never);
    done();
    revalidatePath(`/movimientos/${id}`);
  });
}

/** Only list pages are valid return targets (never an arbitrary URL from the form). */
const LIST_TARGET = /^\/(movimientos|ingresos|gastos|transferencias)(\?[A-Za-z0-9_=&%.+-]*)?$/;

/** "Eliminar": an auditable void (reversal entry), never a hard delete. Redirects to the list with a confirmation banner. */
export async function voidMovementAction(id: string, _: ActionState, form: FormData) {
  const f = fields(form);
  const s = await guarded(async (u, ex) => {
    await voidMovement(ex, u, id, f.reason);
    done();
  });
  if (s?.ok) {
    const to = LIST_TARGET.test(f.returnTo ?? "") ? f.returnTo : "/movimientos";
    redirect(`${to}${to.includes("?") ? "&" : "?"}eliminado=1`);
  }
  return s;
}
