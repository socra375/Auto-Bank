"use server";

import { revalidatePath } from "next/cache";
import { confirmProposal, rejectProposal } from "@/server/eddie/proposals";
import { guarded } from "./guarded";

export interface DecisionResult { error?: string; status?: "confirmed" | "rejected"; transactionId?: string }

/**
 * The owner's Confirm button. A server action (requireOwner() first via guarded()), NOT a model tool:
 * the model has no way to call it. Runs the stored proposal payload through the normal ledger services.
 */
export async function confirmProposalAction(proposalId: string): Promise<DecisionResult> {
  let transactionId: string | undefined;
  const s = await guarded(async (userId, ex) => {
    transactionId = (await confirmProposal(ex, userId, String(proposalId))).transactionId;
    for (const p of ["/movimientos", "/ingresos", "/gastos", "/transferencias", "/cuentas", "/"]) revalidatePath(p);
    return "Registrado.";
  });
  return s?.error ? { error: s.error } : { status: "confirmed", transactionId };
}

export async function rejectProposalAction(proposalId: string): Promise<DecisionResult> {
  const s = await guarded(async (userId, ex) => {
    await rejectProposal(ex, userId, String(proposalId));
    return "Rechazada.";
  });
  return s?.error ? { error: s.error } : { status: "rejected" };
}
