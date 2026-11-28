"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/actions/guarded";
import { cn } from "@/lib/utils";

/** Server-action form with pending state and an accessible status/error message. */
export function ActionForm({
  action, submit, pendingLabel = "Guardando…", resetOnSuccess, variant = "primary", className, children,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  submit: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  variant?: "primary" | "danger" | "ghost";
  className?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={cn("space-y-4", className)}>
      {children}
      {state?.error && (
        <p role="alert" className="feedback flex items-start gap-2 rounded-lg border border-negative bg-negative-soft px-3 py-2.5 text-sm text-negative">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{state.error}</span>
        </p>
      )}
      {state?.ok && (
        <p role="status" className="feedback flex items-start gap-2 rounded-lg bg-positive-soft px-3 py-2.5 text-sm text-positive">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{state.ok}</span>
        </p>
      )}
      <button
        type="submit" disabled={pending}
        className={cn("btn", variant === "primary" && "btn-primary", variant === "danger" && "btn-danger", variant === "ghost" && "btn-secondary")}
      >
        {pending && <Loader2 className="spin size-4" aria-hidden />}
        {pending ? pendingLabel : submit}
      </button>
    </form>
  );
}
