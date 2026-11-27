"use server";

import { revalidatePath } from "next/cache";
import { archiveAccount, createAccount, unarchiveAccount, updateAccount } from "@/server/accounts";
import { fields, guarded, type ActionState } from "./guarded";

const done = () => revalidatePath("/cuentas");

export async function createAccountAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await createAccount(ex, u, fields(form) as never);
    done();
    return "Cuenta creada.";
  });
}

export async function updateAccountAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    const { id, ...rest } = fields(form);
    await updateAccount(ex, u, id, rest as never);
    done();
  });
}

export async function archiveAccountAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await archiveAccount(ex, u, fields(form).id, { confirmNonZero: form.get("confirmNonZero") === "on" });
    done();
    return "Cuenta archivada.";
  });
}

export async function unarchiveAccountAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await unarchiveAccount(ex, u, fields(form).id);
    done();
    return "Cuenta reactivada.";
  });
}
