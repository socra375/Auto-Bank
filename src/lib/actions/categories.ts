"use server";

import { revalidatePath } from "next/cache";
import { createCategory, seedDefaultCategories, setCategoryStatus, updateCategory } from "@/server/categories";
import { fields, guarded, type ActionState } from "./guarded";

const done = () => revalidatePath("/categorias");

export async function createCategoryAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    await createCategory(ex, u, fields(form) as never);
    done();
    return "Categoría creada.";
  });
}

export async function updateCategoryAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    const { id, ...rest } = fields(form);
    await updateCategory(ex, u, id, rest as never);
    done();
  });
}

export async function setCategoryStatusAction(_: ActionState, form: FormData) {
  return guarded(async (u, ex) => {
    const { id, status } = fields(form);
    if (status !== "active" && status !== "archived") throw new Error("estado inválido");
    await setCategoryStatus(ex, u, id, status);
    done();
    return status === "archived" ? "Categoría archivada." : "Categoría reactivada.";
  });
}

export async function seedCategoriesAction() {
  return guarded(async (u, ex) => {
    const n = await seedDefaultCategories(ex, u);
    done();
    return n ? `Se agregaron ${n} categorías sugeridas.` : "Las categorías sugeridas ya existían.";
  });
}
