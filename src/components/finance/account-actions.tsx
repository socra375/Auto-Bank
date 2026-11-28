"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, Archive, ChevronDown, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { archiveAccountAction, unarchiveAccountAction, updateAccountAction } from "@/lib/actions/accounts";
import type { ActionState } from "@/lib/actions/guarded";
import { Field, inputCls } from "@/components/ui/fields";

type Dlg = "edit" | "archive" | "unarchive" | null;

/** Small form wrapper: pending state, error message, closes the dialog when the action succeeds. */
function DialogForm({
  action, onDone, onCancel, submit, pendingLabel, danger, children,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>; onDone: () => void; onCancel: () => void;
  submit: string; pendingLabel: string; danger?: boolean; children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state?.error && (
        <p role="alert" className="feedback flex items-start gap-2 rounded-lg border border-negative bg-negative-soft px-3 py-2.5 text-sm text-negative">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{state.error}</span>
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={pending} className={danger ? "btn btn-danger" : "btn btn-primary"}>
          {pending && <Loader2 className="spin size-4" aria-hidden />}{pending ? pendingLabel : submit}
        </button>
      </div>
    </form>
  );
}

/**
 * "Acciones" menu of an account card (disclosure pattern: button + list, Esc closes and returns focus, focus leaving closes)
 * with Editar and Archivar / Reactivar, each in an accessible dialog. Accounts are never deleted: archiving keeps the history.
 */
export function AccountActions({
  id, name, description, archived, balanceLabel, nonZero,
}: { id: string; name: string; description: string | null; archived: boolean; balanceLabel: string; nonZero: boolean }) {
  const [menu, setMenu] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const open = (d: Dlg) => { setMenu(false); setDlg(d); };
  const close = () => setDlg(null);
  useEffect(() => { if (menu) first.current?.focus(); }, [menu]);
  const dialogProps = (d: Exclude<Dlg, null>) => ({
    open: dlg === d,
    onOpenChange: (o: boolean) => { if (!o) close(); },
  });
  const content = "fixed inset-0 z-50 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-pop)]";
  const veil = <Dialog.Overlay data-veil className="fixed inset-0 z-40 bg-[var(--overlay)]" />;
  const focusBtn = (e: Event) => { e.preventDefault(); btn.current?.focus(); };
  return (
    <div
      ref={root} className="ac-menu"
      onKeyDown={(e) => { if (e.key === "Escape" && menu) { e.stopPropagation(); setMenu(false); btn.current?.focus(); } }}
      onBlur={(e) => { if (menu && !root.current?.contains(e.relatedTarget as Node | null)) setMenu(false); }}
    >
      <button
        ref={btn} type="button" className="btn btn-secondary ac-more" aria-expanded={menu} aria-haspopup="true" aria-controls={`acm-${id}`}
        aria-label={`Acciones de ${name}`} onClick={() => setMenu((v) => !v)}
      >
        Acciones<ChevronDown className="size-4" aria-hidden />
      </button>
      {menu && (
        <ul id={`acm-${id}`} className="ac-pop feedback">
          <li><button ref={first} type="button" className="ac-opt" onClick={() => open("edit")}><Pencil className="size-4" aria-hidden />Editar</button></li>
          <li>
            {archived
              ? <button type="button" className="ac-opt" onClick={() => open("unarchive")}><RotateCcw className="size-4" aria-hidden />Reactivar</button>
              : <button type="button" className="ac-opt" onClick={() => open("archive")}><Archive className="size-4" aria-hidden />Archivar</button>}
          </li>
        </ul>
      )}

      <Dialog.Root {...dialogProps("edit")}>
        <Dialog.Portal>{veil}
          <Dialog.Content data-modal className={content} aria-describedby={`ed-${id}`} onCloseAutoFocus={focusBtn}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <Dialog.Title className="section-title">Editar cuenta</Dialog.Title>
              <Dialog.Close aria-label="Cerrar" className="icon-btn"><X className="size-5" aria-hidden /></Dialog.Close>
            </div>
            <Dialog.Description id={`ed-${id}`} className="mb-4 text-sm text-muted">Solo el nombre y la descripción. La moneda y el saldo inicial no cambian.</Dialog.Description>
            <DialogForm action={updateAccountAction} onDone={close} onCancel={close} submit="Guardar" pendingLabel="Guardando…">
              <input type="hidden" name="id" value={id} />
              <Field label="Nombre" id={`n-${id}`}><input id={`n-${id}`} name="name" required maxLength={80} defaultValue={name} className={inputCls} /></Field>
              <Field label="Descripción" id={`d-${id}`}><input id={`d-${id}`} name="description" maxLength={500} defaultValue={description ?? ""} className={inputCls} /></Field>
            </DialogForm>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root {...dialogProps("archive")}>
        <Dialog.Portal>{veil}
          <Dialog.Content data-modal className={content} aria-describedby={`ar-${id}`} onCloseAutoFocus={focusBtn}>
            <Dialog.Title className="section-title mb-3">¿Archivar «{name}»?</Dialog.Title>
            <div id={`ar-${id}`} className="mb-4 space-y-2 text-sm">
              <p className="text-muted">Las cuentas no se borran: al archivarla se conserva todo su historial y su saldo, ya no admite movimientos nuevos y puedes reactivarla cuando quieras.</p>
              {nonZero && <p className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2.5">Esta cuenta tiene un saldo de <strong>{balanceLabel}</strong>.</p>}
            </div>
            <DialogForm action={archiveAccountAction} onDone={close} onCancel={close} submit="Archivar cuenta" pendingLabel="Archivando…">
              <input type="hidden" name="id" value={id} />
              {nonZero && (
                <label className="check text-sm"><input type="checkbox" name="confirmNonZero" required /> Confirmo archivar con saldo distinto de cero</label>
              )}
            </DialogForm>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root {...dialogProps("unarchive")}>
        <Dialog.Portal>{veil}
          <Dialog.Content data-modal className={content} aria-describedby={`un-${id}`} onCloseAutoFocus={focusBtn}>
            <Dialog.Title className="section-title mb-3">¿Reactivar «{name}»?</Dialog.Title>
            <Dialog.Description id={`un-${id}`} className="mb-4 text-sm text-muted">Volverá a la lista de cuentas activas y admitirá movimientos otra vez. Su historial no cambia.</Dialog.Description>
            <DialogForm action={unarchiveAccountAction} onDone={close} onCancel={close} submit="Reactivar cuenta" pendingLabel="Reactivando…">
              <input type="hidden" name="id" value={id} />
            </DialogForm>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
