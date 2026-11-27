import { createHash } from "node:crypto";
import { formatMoney, type Currency } from "@/lib/money";
import { fmtDate, todayDR } from "@/lib/dates";
import { audit } from "../audit";
import { getAccount } from "../accounts";
import { getCategory } from "../categories";
import { DomainError, notFound } from "../errors";
import type { Executor } from "../executor";
import { postTransaction, validateMovement } from "../ledger";
import { idSchema, movementSchema, type MovementInput } from "../schemas";

export const PROPOSAL_TTL_MIN = 15;
export const MAX_PENDING = 5;
export type ProposalKind = "income" | "expense" | "transfer";
export type ProposalStatus = "pending" | "confirmed" | "rejected" | "expired";

export interface PreviewLeg { account: string; currency: Currency; amountMinor: string; balanceBeforeMinor: string; balanceAfterMinor: string }
/** Server-generated, exactly what the owner sees on the card. Amounts are minor-unit strings. */
export interface Preview {
  type: ProposalKind; date: string; description: string; notes: string | null; category: string | null; fxRate: string | null;
  legs: PreviewLeg[]; text: string;
}
export interface Proposal {
  id: string; kind: ProposalKind; status: ProposalStatus; preview: Preview; createdAt: string; expiresAt: string; resultTxnId: string | null;
}

/** Deterministic JSON (sorted keys) so the hash does not depend on jsonb key order. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
export const hashPayload = (userId: string, kind: string, payload: unknown) =>
  createHash("sha256").update(canonical({ userId, kind, payload })).digest("hex");

function previewText(p: Omit<Preview, "text">): string {
  const money = (m: string, c: Currency) => formatMoney(BigInt(m), c);
  const [a, b] = p.legs;
  const head = p.type === "transfer"
    ? `Transferencia de ${money(String(-BigInt(a.amountMinor)), a.currency)} de «${a.account}» a «${b.account}»${a.currency !== b.currency ? ` (recibe ${money(b.amountMinor, b.currency)}, tasa ${p.fxRate})` : ""}`
    : `${p.type === "income" ? "Ingreso" : "Gasto"} de ${money(String(BigInt(a.amountMinor) < 0n ? -BigInt(a.amountMinor) : BigInt(a.amountMinor)), a.currency)} en «${a.account}»${p.category ? `, categoría «${p.category}»` : ""}`;
  const effects = p.legs.map((l) => `${l.account}: ${money(l.balanceBeforeMinor, l.currency)} → ${money(l.balanceAfterMinor, l.currency)}`).join("; ");
  return `${head}, fecha ${fmtDate(p.date)}, «${p.description}». Saldo resultante — ${effects}.`;
}

/** Normalises tool input into a movement input (strings only) and validates it with the SAME rules the UI uses. */
export async function createProposal(ex: Executor, userId: string, kind: ProposalKind, input: Record<string, unknown>): Promise<Proposal> {
  const payload = { ...input, type: kind, date: (input.date as string | undefined) ?? todayDR() } as Record<string, unknown>;
  delete payload.idempotencyKey;
  movementSchema.parse(payload); // amount bounds, ids, dates, description length
  const t = await validateMovement(ex.query, userId, payload as MovementInput); // ownership, active, currency/FX rules, category kind
  const legs: PreviewLeg[] = [];
  for (const l of t.legs) {
    const a = await getAccount(ex.query, userId, l.accountId);
    legs.push({ account: a.name, currency: a.currency, amountMinor: l.amountMinor.toString(), balanceBeforeMinor: a.balanceMinor.toString(), balanceAfterMinor: (a.balanceMinor + l.amountMinor).toString() });
  }
  const category = t.categoryId ? (await getCategory(ex.query, userId, t.categoryId)).name : null;
  const base = { type: kind, date: t.date, description: t.description, notes: t.notes ?? null, category, fxRate: t.fxRate ?? null, legs };
  const preview: Preview = { ...base, text: previewText(base) };
  const hash = hashPayload(userId, kind, payload);

  return ex.transaction(async (q) => {
    await q(`select pg_advisory_xact_lock(hashtext($1))`, [`eddie:${userId}`]);
    await q(`update eddie_proposals set status = 'expired', decided_at = now() where user_id = $1 and status = 'pending' and expires_at <= now()`, [userId]);
    const n = Number((await q(`select count(*)::int as n from eddie_proposals where user_id = $1 and status = 'pending'`, [userId])).rows[0].n);
    if (n >= MAX_PENDING) throw new DomainError("PENDING_CAP", `Ya hay ${MAX_PENDING} propuestas pendientes. Confirma o rechaza alguna antes de crear otra.`);
    const r = await q(
      `insert into eddie_proposals (user_id, kind, payload, payload_hash, preview, expires_at)
       values ($1,$2,$3::jsonb,$4,$5::jsonb, now() + make_interval(mins => $6))
       returning id, created_at::text as created_at, expires_at::text as expires_at`,
      [userId, kind, JSON.stringify(payload), hash, JSON.stringify(preview), PROPOSAL_TTL_MIN],
    );
    const row = r.rows[0];
    await audit(q, userId, "eddie.proposal.create", "eddie_proposal", row.id as string, null, { kind, payload, hash }, "eddie");
    return { id: row.id as string, kind, status: "pending", preview, createdAt: row.created_at as string, expiresAt: row.expires_at as string, resultTxnId: null };
  });
}

const mapProposal = (r: Record<string, unknown>): Proposal => ({
  id: r.id as string, kind: r.kind as ProposalKind, status: r.status as ProposalStatus, preview: r.preview as Preview,
  createdAt: r.created_at as string, expiresAt: r.expires_at as string, resultTxnId: (r.result_txn_id as string | null) ?? null,
});
const COLS = `id, kind, status, preview, created_at::text as created_at, expires_at::text as expires_at, result_txn_id`;

/** Current state of the given proposals (owner's only). A pending one past its expiry is reported as expired. */
export async function getProposals(ex: Executor, userId: string, ids: string[]): Promise<Proposal[]> {
  const valid = ids.filter((i) => idSchema.safeParse(i).success).slice(0, 100);
  if (!valid.length) return [];
  const r = await ex.query(
    `select ${COLS.replace("status,", "case when status = 'pending' and expires_at <= now() then 'expired' else status end as status,")}
     from eddie_proposals where user_id = $1 and id = any($2::uuid[])`, [userId, valid]);
  return r.rows.map(mapProposal);
}

type Outcome =
  | { ok: true; transactionId: string; duplicate: boolean }
  | { ok: false; code: string; message: string };

/**
 * Executes the STORED payload of a proposal, exactly once. Called only from the owner's Confirm server action.
 * Everything (lock, checks, posting, status change, audit) happens in ONE DB transaction; the proposal id is the idempotency key.
 */
export async function confirmProposal(ex: Executor, userId: string, id: string): Promise<{ transactionId: string; duplicate: boolean }> {
  if (!idSchema.safeParse(id).success) throw notFound("Propuesta");
  const out = await ex.transaction(async (q): Promise<Outcome> => {
    const r = await q(
      `select kind, payload, payload_hash, status, result_txn_id, expires_at <= now() as expired
       from eddie_proposals where id = $1 and user_id = $2 for update`, [id, userId]);
    const p = r.rows[0];
    if (!p) throw notFound("Propuesta");
    if (p.status === "confirmed") return { ok: true, transactionId: p.result_txn_id as string, duplicate: true };
    if (p.status !== "pending") return { ok: false, code: "NOT_PENDING", message: `Esta propuesta ya fue ${p.status === "rejected" ? "rechazada" : "vencida"}.` };
    if (p.expired) {
      await q(`update eddie_proposals set status = 'expired', decided_at = now() where id = $1`, [id]);
      await audit(q, userId, "eddie.proposal.expire", "eddie_proposal", id, { status: "pending" }, { status: "expired" }, "eddie");
      return { ok: false, code: "EXPIRED", message: "La propuesta venció. Pídele a Eddie que la prepare de nuevo." };
    }
    const kind = p.kind as ProposalKind;
    const payload = p.payload as Record<string, unknown>;
    if (hashPayload(userId, kind, payload) !== p.payload_hash || payload.type !== kind) {
      await q(`update eddie_proposals set status = 'rejected', decided_at = now() where id = $1`, [id]);
      await audit(q, userId, "eddie.proposal.tamper", "eddie_proposal", id, { status: "pending" }, { status: "rejected", reason: "hash_mismatch" }, "eddie");
      return { ok: false, code: "TAMPERED", message: "La propuesta no coincide con lo que se mostró y fue rechazada. No se registró nada." };
    }
    const t = await validateMovement(q, userId, { ...payload, idempotencyKey: id } as MovementInput);
    const txnId = await postTransaction(q, userId, { ...t, idempotencyKey: id, actor: "eddie" });
    await q(`update eddie_proposals set status = 'confirmed', decided_at = now(), result_txn_id = $2 where id = $1`, [id, txnId]);
    await audit(q, userId, "eddie.proposal.confirm", "eddie_proposal", id, { status: "pending" }, { status: "confirmed", transactionId: txnId, decidedBy: "owner" }, "eddie");
    return { ok: true, transactionId: txnId, duplicate: false };
  });
  if (!out.ok) throw new DomainError(out.code, out.message);
  return { transactionId: out.transactionId, duplicate: out.duplicate };
}

export async function rejectProposal(ex: Executor, userId: string, id: string): Promise<{ status: "rejected" }> {
  if (!idSchema.safeParse(id).success) throw notFound("Propuesta");
  const out = await ex.transaction(async (q) => {
    const r = await q(`select status from eddie_proposals where id = $1 and user_id = $2 for update`, [id, userId]);
    if (!r.rows[0]) throw notFound("Propuesta");
    const s = r.rows[0].status as ProposalStatus;
    if (s === "rejected") return "ok";
    if (s !== "pending") return `Esta propuesta ya está ${s === "confirmed" ? "confirmada" : "vencida"}.`;
    await q(`update eddie_proposals set status = 'rejected', decided_at = now() where id = $1`, [id]);
    await audit(q, userId, "eddie.proposal.reject", "eddie_proposal", id, { status: "pending" }, { status: "rejected", decidedBy: "owner" }, "eddie");
    return "ok";
  });
  if (out !== "ok") throw new DomainError("NOT_PENDING", out);
  return { status: "rejected" };
}
