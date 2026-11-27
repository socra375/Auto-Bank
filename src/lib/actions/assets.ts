"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addValuation, createAsset, disposeAsset, updateAsset } from "@/server/assets";
import { fields, guarded, type ActionState } from "./guarded";

const done = (id?: string) => {
  revalidatePath("/patrimonio");
  if (id) revalidatePath(`/patrimonio/${id}`);
};

export async function createAssetAction(_: ActionState, form: FormData) {
  let id: string | undefined;
  const s = await guarded(async (u, ex) => {
    const r = await createAsset(ex, u, fields(form) as never);
    id = r.id;
    done();
    return r.duplicate ? "Este bien ya estaba registrado." : "Bien registrado.";
  });
  if (s?.ok && id) redirect(`/patrimonio/${id}`);
  return s;
}

/** Bound with the asset id from the detail page. */
export async function addValuationAction(assetId: string, _: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    const r = await addValuation(ex, u, assetId, fields(form) as never);
    done(assetId);
    return r.duplicate ? "Esta valoración ya estaba registrada." : "Valoración registrada.";
  });
}

export async function updateAssetAction(assetId: string, _: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await updateAsset(ex, u, assetId, fields(form) as never);
    done(assetId);
  });
}

export async function disposeAssetAction(assetId: string, _: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await disposeAsset(ex, u, assetId, fields(form) as never);
    done(assetId);
    return "Bien dado de baja.";
  });
}
