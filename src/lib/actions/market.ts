"use server";

import { revalidatePath } from "next/cache";
import {
  addWatchlistItem, createWatchlist, deleteWatchlist, removeWatchlistItem, renameWatchlist, toggleFavorite,
} from "@/server/market/service";
import { fields, guarded, type ActionState } from "./guarded";

const done = () => revalidatePath("/mercados");

export async function toggleFavoriteAction(symbol: string) {
  return guarded(async (u, ex) => {
    const r = await toggleFavorite(ex, u, symbol);
    done();
    return r.favorite ? "Agregado a favoritos." : "Quitado de favoritos.";
  });
}

export async function createWatchlistAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await createWatchlist(ex, u, fields(form).name);
    done();
    return "Lista creada.";
  });
}

export async function renameWatchlistAction(id: string, _: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await renameWatchlist(ex, u, id, fields(form).name);
    done();
    return "Lista renombrada.";
  });
}

export async function deleteWatchlistAction(id: string) {
  return guarded(async (u, ex) => {
    await deleteWatchlist(ex, u, id);
    done();
    return "Lista eliminada.";
  });
}

export async function addWatchlistItemAction(id: string, symbol: string) {
  return guarded(async (u, ex) => {
    await addWatchlistItem(ex, u, id, symbol);
    done();
    return "Agregado a la lista.";
  });
}

export async function removeWatchlistItemAction(id: string, symbol: string) {
  return guarded(async (u, ex) => {
    await removeWatchlistItem(ex, u, id, symbol);
    done();
    return "Quitado de la lista.";
  });
}
