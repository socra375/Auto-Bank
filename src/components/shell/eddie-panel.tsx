"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, Check, FileCheck2, Loader2, Send, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/states/states";
import { confirmProposalAction, rejectProposalAction } from "@/lib/actions/eddie";
import { fmtDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { StoredMessage } from "@/server/eddie/messages";
import type { Proposal } from "@/server/eddie/proposals";

type Msg = UIMessage<unknown, { proposal: { id: string } }>;
export interface Boot { configured: boolean; missing: string[]; messages: StoredMessage[]; proposals: Proposal[] }

const ENDPOINT = "/api/eddie/chat";
const toUi = (m: StoredMessage): Msg => ({
  id: `h${m.id}`, role: m.role,
  parts: m.parts.map((p) => (p.type === "text" ? { type: "text" as const, text: p.text } : { type: "data-proposal" as const, data: { id: p.proposalId } })),
});

/** Proposal ids in a message, from stored markers or from live propose_* tool results. */
function proposalIds(m: Msg): string[] {
  return m.parts.flatMap((p) => {
    if (p.type === "data-proposal") return [p.data.id];
    const t = p as { type: string; state?: string; output?: { data?: { proposalId?: string } } };
    return t.type.startsWith("tool-propose_") && t.state === "output-available" && t.output?.data?.proposalId ? [t.output.data.proposalId] : [];
  });
}
const textOf = (m: Msg) => m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");

function friendly(e: Error | undefined): string {
  if (!e) return "";
  try {
    const j = JSON.parse(e.message) as { error?: string };
    if (j.error && j.error !== "not_configured") return j.error;
  } catch { /* not JSON */ }
  return "Eddie no pudo responder ahora. Inténtalo de nuevo.";
}

export function EddiePanel() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchBoot = useCallback(async () => {
    const r = await fetch(ENDPOINT, { cache: "no-store" });
    if (!r.ok) throw new Error("load");
    return (await r.json()) as Boot;
  }, []);
  const start = useCallback(() => { fetchBoot().then(setBoot, () => setFailed(true)); }, [fetchBoot]);
  const refresh = useCallback(async () => { await fetchBoot().then(setBoot, () => undefined); }, [fetchBoot]);
  useEffect(() => { start(); }, [start]);

  if (failed) return <div className="p-4"><ErrorState title="No se pudo cargar Eddie" description="Revisa tu conexión e inténtalo de nuevo." onRetry={() => { setFailed(false); start(); }} /></div>;
  if (!boot) return <LoadingState label="Cargando Eddie…" />;
  if (!boot.configured) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <EmptyState
          icon={Bot}
          title="Eddie no está configurado"
          description={`Falta configurar en el servidor: ${boot.missing.join(" y ")}. Mientras tanto Eddie no responde ni accede a tus datos.`}
        />
      </div>
    );
  }
  return <Chat boot={boot} refresh={refresh} />;
}

export function Chat({ boot, refresh }: { boot: Boot; refresh: () => Promise<void> }) {
  const [input, setInput] = useState("");
  const [local, setLocal] = useState<Record<string, Proposal>>({});
  const { messages, sendMessage, status, error, stop } = useChat<Msg>({
    messages: boot.messages.map(toUi),
    // Only the new text goes to the server; history lives there (never trusted from the client).
    transport: new DefaultChatTransport({
      api: ENDPOINT,
      prepareSendMessagesRequest: ({ messages: all }) => ({ body: { message: textOf(all[all.length - 1]) } }),
    }),
  });
  const busy = status === "submitted" || status === "streaming";
  const proposals: Record<string, Proposal> = { ...Object.fromEntries(boot.proposals.map((p) => [p.id, p])), ...local };

  const missing = messages.flatMap(proposalIds).some((id) => !proposals[id]);
  useEffect(() => { if (status === "ready" && missing) void refresh(); }, [status, missing, refresh]);

  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages, status]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <EmptyState
            icon={Bot}
            title="¿En qué te ayudo?"
            description="Puedo consultar saldos, movimientos, préstamos, deudas y patrimonio, resumir tus finanzas y proponer ingresos, gastos y transferencias. No puedo anular, editar ni borrar, ni tocar préstamos, cuentas o ajustes."
          />
        )}
        <div role="log" aria-live="polite" aria-relevant="additions text" aria-busy={busy} aria-label="Conversación con Eddie" className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[88%] space-y-2 ${m.role === "user" ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-on-primary" : "rounded-2xl rounded-bl-md bg-surface-2 px-4 py-2.5 text-sm"}`}>
                {textOf(m) && <p className="whitespace-pre-wrap break-words">{textOf(m)}</p>}
                {proposalIds(m).map((id) => (
                  <ProposalCard key={id} id={id} proposal={proposals[id]} onChange={(p) => setLocal((s) => ({ ...s, [id]: p }))} />
                ))}
              </div>
            </div>
          ))}
          {status === "submitted" && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="spin size-4" aria-hidden /> Eddie está pensando…</p>}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg border border-negative bg-negative-soft p-3 text-sm text-negative">{friendly(error)}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t border-border bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <label htmlFor="eddie-input" className="sr-only">Mensaje para Eddie</label>
        <textarea
          id="eddie-input" rows={2} maxLength={1000} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Pregunta o pide una propuesta…"
          className="field-input flex-1 resize-none"
        />
        {busy ? (
          <button type="button" onClick={() => void stop()} className="btn btn-secondary !px-0" aria-label="Detener respuesta">
            <X className="size-5" aria-hidden />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="btn btn-primary !px-0" aria-label="Enviar mensaje">
            <Send className="size-5" aria-hidden />
          </button>
        )}
      </form>
    </>
  );
}

const STATUS: Record<Proposal["status"], string> = { pending: "Pendiente", confirmed: "Confirmada", rejected: "Rechazada", expired: "Vencida" };
const KIND: Record<Proposal["kind"], string> = { income: "Ingreso", expense: "Gasto", transfer: "Transferencia" };

export function ProposalCard({ id, proposal, onChange }: { id: string; proposal?: Proposal; onChange: (p: Proposal) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!proposal) {
    return <div className="card !p-4 text-sm text-muted" role="status">Preparando propuesta…</div>;
  }
  const pv = proposal.preview;
  const decide = (kind: "confirm" | "reject") => start(async () => {
    setError(null);
    const r = await (kind === "confirm" ? confirmProposalAction(id) : rejectProposalAction(id));
    if (r.error) setError(r.error);
    else onChange({ ...proposal, status: r.status!, resultTxnId: r.transactionId ?? null });
  });
  const decided = proposal.status !== "pending";
  return (
    <section aria-label={`Propuesta de ${KIND[proposal.kind]}`} className="card !p-4 text-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><FileCheck2 className="size-4 text-primary" aria-hidden />{KIND[proposal.kind]} propuesto</h3>
        <span className={`badge ${proposal.status === "confirmed" ? "badge-positive" : proposal.status === "pending" ? "badge-info" : "badge-neutral"}`}>{STATUS[proposal.status]}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">Fecha</dt><dd>{fmtDate(pv.date)}</dd>
        <dt className="text-muted">Descripción</dt><dd className="break-words">{pv.description}</dd>
        {pv.category && (<><dt className="text-muted">Categoría</dt><dd>{pv.category}</dd></>)}
        {pv.fxRate && (<><dt className="text-muted">Tasa</dt><dd>{pv.fxRate}</dd></>)}
        {pv.legs.map((l, i) => (
          <div key={i} className="col-span-2 mt-1 rounded-lg bg-surface-2 p-3">
            <p className="font-semibold">{l.account}: <span className={BigInt(l.amountMinor) < 0n ? "neg" : "pos"}>{formatMoney(BigInt(l.amountMinor), l.currency)}</span></p>
            <p className="text-xs text-muted">Saldo: {formatMoney(BigInt(l.balanceBeforeMinor), l.currency)} → {formatMoney(BigInt(l.balanceAfterMinor), l.currency)}</p>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">Eddie propone, tú confirmas. Nada se registra hasta que pulses Confirmar.</p>
      {error && <p role="alert" className="mt-2 text-xs text-negative">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={decided || pending} onClick={() => decide("confirm")} className="btn btn-primary">
          {pending ? <Loader2 className="spin size-4" aria-hidden /> : <Check className="size-4" aria-hidden />} Confirmar
        </button>
        <button type="button" disabled={decided || pending} onClick={() => decide("reject")} className="btn btn-secondary">
          <X className="size-4" aria-hidden /> Rechazar
        </button>
        {proposal.status === "confirmed" && proposal.resultTxnId && (
          <Link href={`/movimientos/${proposal.resultTxnId}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">Ver movimiento</Link>
        )}
      </div>
    </section>
  );
}
