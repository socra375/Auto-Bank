import { tool } from "ai";
import type { Executor } from "../executor";
import { createToolkit, schemas, type ToolName } from "./toolkit";

const DESC: Record<ToolName, string> = {
  list_accounts: "Lista las cuentas con su id, moneda y saldo actual. Úsala para obtener ids; si varias coinciden, pregunta al usuario cuál.",
  list_categories: "Lista las categorías activas (id, nombre, tipo ingreso/gasto).",
  list_movements: "Consulta y busca movimientos (filtros opcionales: fechas, tipo, cuenta, categoría, texto). Máximo 20.",
  get_loans: "Consulta préstamos y deudas (por cobrar / por pagar) con saldos pendientes.",
  get_net_worth: "Patrimonio neto por moneda (cuentas, bienes, deudas, por cobrar). DOP y USD nunca se suman.",
  get_summary: "Resumen financiero de un período: ingresos, gastos, neto y principales categorías de gasto, por moneda.",
  propose_income: "PROPONE un ingreso. No lo registra: crea una propuesta que el usuario debe confirmar. Usa ids de list_accounts/list_categories.",
  propose_expense: "PROPONE un gasto. No lo registra: crea una propuesta que el usuario debe confirmar. Usa ids de list_accounts/list_categories.",
  propose_transfer: "PROPONE una transferencia entre cuentas propias. Entre monedas distintas exige amountIn y fxRate dados por el usuario. No la registra.",
};

/** The complete tool registry for one request. userId comes from the server session; there is deliberately no confirm/void/edit/delete tool. */
export function buildTools(ex: Executor, userId: string) {
  const kit = createToolkit(ex, userId);
  const t = <N extends ToolName>(name: N) =>
    tool({ description: DESC[name], inputSchema: schemas[name], execute: async (input: unknown) => kit[name](input) });
  return {
    list_accounts: t("list_accounts"), list_categories: t("list_categories"), list_movements: t("list_movements"),
    get_loans: t("get_loans"), get_net_worth: t("get_net_worth"), get_summary: t("get_summary"),
    propose_income: t("propose_income"), propose_expense: t("propose_expense"), propose_transfer: t("propose_transfer"),
  };
}
