import type { z } from "zod";
import { audit } from "./audit";
import { DomainError, isUniqueViolation, notFound } from "./errors";
import type { Executor, Query } from "./executor";
import { categoryCreateSchema, categoryEditSchema, idSchema } from "./schemas";

export type CategoryKind = "income" | "expense";
export interface Category { id: string; name: string; kind: CategoryKind; color: string | null; status: "active" | "archived" }

const COLS = `id, name, kind::text as kind, color, status::text as status`;
const map = (r: Record<string, unknown>) => r as unknown as Category;

export async function listCategories(ex: Executor, userId: string): Promise<Category[]> {
  const r = await ex.query(`select ${COLS} from categories where user_id = $1 order by (status = 'archived'), kind, name`, [userId]);
  return r.rows.map(map);
}

export async function getCategory(q: Query, userId: string, id: string): Promise<Category> {
  if (!idSchema.safeParse(id).success) throw notFound("Categoría");
  const r = await q(`select ${COLS} from categories where id = $1 and user_id = $2`, [id, userId]);
  if (!r.rows[0]) throw notFound("Categoría");
  return map(r.rows[0]);
}

const dup = (e: unknown) => {
  if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", "Ya existe una categoría con ese nombre.");
  throw e;
};

export async function createCategory(ex: Executor, userId: string, raw: z.input<typeof categoryCreateSchema>) {
  const i = categoryCreateSchema.parse(raw);
  try {
    return await ex.transaction(async (q) => {
      const r = await q(`insert into categories (user_id, name, kind, color) values ($1,$2,$3,$4) returning id`, [
        userId, i.name, i.kind, i.color ?? null,
      ]);
      const id = r.rows[0].id as string;
      await audit(q, userId, "category.create", "category", id, null, i);
      return id;
    });
  } catch (e) {
    return dup(e);
  }
}

/** Kind is not editable: existing movements are typed by it. */
export async function updateCategory(ex: Executor, userId: string, id: string, raw: z.input<typeof categoryEditSchema>) {
  const i = categoryEditSchema.parse(raw);
  try {
    await ex.transaction(async (q) => {
      const before = await getCategory(q, userId, id);
      await q(`update categories set name = $3, color = $4 where id = $1 and user_id = $2`, [id, userId, i.name, i.color ?? null]);
      await audit(q, userId, "category.update", "category", id, { name: before.name, color: before.color }, i);
    });
  } catch (e) {
    dup(e);
  }
}

export async function setCategoryStatus(ex: Executor, userId: string, id: string, status: "active" | "archived") {
  await ex.transaction(async (q) => {
    const before = await getCategory(q, userId, id);
    if (before.status === status) return;
    await q(`update categories set status = $3 where id = $1 and user_id = $2`, [id, userId, status]);
    await audit(q, userId, status === "archived" ? "category.archive" : "category.unarchive", "category", id,
      { status: before.status }, { status });
  });
}

const DEFAULTS: Record<CategoryKind, string[]> = {
  income: ["Salario", "Negocio / Freelance", "Intereses", "Regalos", "Otros ingresos"],
  expense: [
    "Alimentación", "Vivienda", "Servicios (luz, agua, internet)", "Transporte", "Salud", "Educación",
    "Entretenimiento", "Ropa", "Compras personales", "Impuestos y comisiones", "Otros gastos",
  ],
};

/** Explicit + idempotent: only invoked by the user's button; re-running adds nothing. Returns how many were created. */
export async function seedDefaultCategories(ex: Executor, userId: string): Promise<number> {
  return ex.transaction(async (q) => {
    let created = 0;
    for (const kind of ["income", "expense"] as const) {
      for (const name of DEFAULTS[kind]) {
        const r = await q(
          `insert into categories (user_id, name, kind) values ($1,$2,$3) on conflict (user_id, kind, name) do nothing returning id`,
          [userId, name, kind],
        );
        created += r.rows.length;
      }
    }
    if (created) await audit(q, userId, "category.seed", "category", null, null, { created });
    return created;
  });
}
