"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useActionState, useRef } from "react";
import type { ActionState } from "@/lib/actions/guarded";
import { cn } from "@/lib/utils";
import { inputCls } from "./fields";

export type ConfirmAction = (s: ActionState, f: FormData) => Promise<ActionState>;

/** The plain-language promise shown in every "Eliminar" confirmation: nothing financial is ever erased. */
export const VOID_NOTICE = "No se borra del historial: se anula con un reverso auditable. Dejará de contar en tus saldos y reportes.";

/**
 * Danger button + accessible confirmation (Radix Dialog: focus trap, focus return, Esc). The confirm button submits `action`
 * (a server action bound to the record). Initial focus lands on "Cancelar", the safe choice.
 * `blocked` replaces the confirm button with an explanation (e.g. a loan that still has payments).
 */
export function ConfirmActionDialog({
  id, triggerLabel = "Eliminar", triggerAriaLabel, triggerClassName, title, children, action, confirmLabel = "Eliminar", pendingLabel = "Eliminando…",
  hidden, blocked, askReason = true, notice = VOID_NOTICE,
}: {
  id: string; triggerLabel?: string; triggerAriaLabel: string; triggerClassName?: string; title: string; children?: React.ReactNode;
  action: ConfirmAction; confirmLabel?: string; pendingLabel?: string; hidden?: Record<string, string>;
  blocked?: React.ReactNode; askReason?: boolean; notice?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root>
      <Dialog.Trigger aria-label={triggerAriaLabel} className={cn("btn btn-danger", triggerClassName)}>
        <Trash2 className="size-4" aria-hidden />{triggerLabel}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay data-veil className="fixed inset-0 z-40 bg-[var(--overlay)]" />
        <Dialog.Content
          data-modal aria-describedby={`${id}-desc`}
          onOpenAutoFocus={(e) => { e.preventDefault(); cancel.current?.focus(); }}
          className="fixed inset-0 z-50 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-pop)]"
        >
          <ConfirmPanel
            id={id} title={title} blocked={blocked} askReason={askReason} notice={notice} confirmLabel={confirmLabel} pendingLabel={pendingLabel}
            formAction={formAction} pending={pending} error={state?.error} hidden={hidden} cancelRef={cancel}
          >{children}</ConfirmPanel>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Dialog body (also rendered on its own by the static preview harness). */
export function ConfirmPanel({
  id, title, children, blocked, askReason, notice, confirmLabel, pendingLabel, formAction, pending, error, hidden, cancelRef, staticPreview,
}: {
  id: string; title: string; children?: React.ReactNode; blocked?: React.ReactNode; askReason?: boolean; notice: string; confirmLabel: string; pendingLabel: string;
  formAction?: (f: FormData) => void; pending?: boolean; error?: string; hidden?: Record<string, string>; cancelRef?: React.Ref<HTMLButtonElement>; staticPreview?: boolean;
}) {
  const Title = staticPreview ? "h2" : Dialog.Title;
  const cancelBtn = staticPreview
    ? <button type="button" className="btn btn-secondary">{blocked ? "Cerrar" : "Cancelar"}</button>
    : <Dialog.Close ref={cancelRef} className="btn btn-secondary">{blocked ? "Cerrar" : "Cancelar"}</Dialog.Close>;
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Title className="section-title">{title}</Title>
      <div id={`${id}-desc`} className="space-y-2 text-sm">
        {children}
        {blocked ? <p className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2.5">{blocked}</p> : <p className="text-muted">{notice}</p>}
      </div>
      {!blocked && askReason && (
        <div>
          <label htmlFor={`${id}-reason`} className="field-label">Motivo (opcional)</label>
          <textarea id={`${id}-reason`} name="reason" rows={2} maxLength={300} className={inputCls} />
        </div>
      )}
      {error && (
        <p role="alert" className="feedback flex items-start gap-2 rounded-lg border border-negative bg-negative-soft px-3 py-2.5 text-sm text-negative">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{error}</span>
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {cancelBtn}
        {!blocked && (
          <button type="submit" disabled={pending} className="btn btn-danger">
            {pending ? <Loader2 className="spin size-4" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            {pending ? pendingLabel : confirmLabel}
          </button>
        )}
      </div>
    </form>
  );
}
