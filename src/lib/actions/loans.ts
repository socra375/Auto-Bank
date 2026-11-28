"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelLoan, createLoan, registerPayment, removeLoan, voidLoanOrigination, voidPayment } from "@/server/loans";
import { fields, guarded, type ActionState } from "./guarded";

const done = (loanId?: string) => {
  for (const p of ["/prestamos", "/cuentas", "/movimientos", "/ingresos", "/gastos"]) revalidatePath(p);
  if (loanId) revalidatePath(`/prestamos/${loanId}`);
};

export async function createLoanAction(_: ActionState, form: FormData) {
  let id: string | undefined;
  const s = await guarded(async (u, ex) => {
    const r = await createLoan(ex, u, { ...fields(form), funded: form.get("funded") === "on" } as never);
    id = r.id;
    done();
    return r.duplicate ? "Este préstamo ya estaba registrado." : "Préstamo registrado.";
  });
  if (s?.ok && id) redirect(`/prestamos/${id}`);
  return s;
}

/** Bound with the loan id from the detail page. */
export async function registerPaymentAction(loanId: string, _: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    const r = await registerPayment(ex, u, loanId, fields(form) as never);
    done(loanId);
    return r.duplicate ? "Este pago ya estaba registrado." : "Pago registrado.";
  });
}

export async function voidPaymentAction(loanId: string, txnId: string, _: ActionState, form: FormData) {
  const s = await guarded(async (u, ex) => {
    await voidPayment(ex, u, txnId, fields(form).reason);
    done(loanId);
    return "Pago anulado.";
  });
  if (s?.ok) redirect(`/prestamos/${loanId}?eliminado=pago`);
  return s;
}

/** "Eliminar préstamo": dispatches to cancelLoan / voidLoanOrigination (auditable; nothing is hard-deleted). */
export async function removeLoanAction(loanId: string, _: ActionState, form: FormData) {
  const s = await guarded(async (u, ex) => {
    await removeLoan(ex, u, loanId, fields(form).reason);
    done(loanId);
  });
  if (s?.ok) redirect("/prestamos?eliminado=1");
  return s;
}

export async function voidLoanOriginAction(loanId: string, txnId: string, _: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await voidLoanOrigination(ex, u, txnId, fields(form).reason);
    done(loanId);
    return "Desembolso anulado.";
  });
}

export async function cancelLoanAction(loanId: string, _: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await cancelLoan(ex, u, loanId, fields(form).reason);
    done(loanId);
    return "Préstamo cancelado.";
  });
}
