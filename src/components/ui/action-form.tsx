"use client";

import { useActionState, useEffect, useRef } from "react";
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
    <form ref={ref} action={formAction} className={cn("space-y-3", className)}>
      {children}
      {state?.error && (
        <p role="alert" className="rounded-md border border-negative px-3 py-2 text-sm text-negative">{state.error}</p>
      )}
      {state?.ok && <p role="status" className="text-sm text-positive">{state.ok}</p>}
      <button
        type="submit" disabled={pending}
        className={cn(
          "rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60",
          variant === "primary" && "bg-primary text-white",
          variant === "danger" && "border border-negative text-negative",
          variant === "ghost" && "border border-border",
        )}
      >
        {pending ? pendingLabel : submit}
      </button>
    </form>
  );
}
