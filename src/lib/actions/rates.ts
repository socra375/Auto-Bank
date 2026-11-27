"use server";

import { revalidatePath } from "next/cache";
import { saveRate } from "@/server/fx";
import { fields, guarded, type ActionState } from "./guarded";

export async function saveRateAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await saveRate(ex, u, fields(form) as never);
    revalidatePath("/configuracion");
    revalidatePath("/cuentas");
    return "Tipo de cambio guardado.";
  });
}
