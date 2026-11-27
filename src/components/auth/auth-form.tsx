"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import type { FormState } from "@/lib/auth/actions";

type Field = { name: string; label: string; type: string; autoComplete: string };

export function AuthForm({
  action, fields, submit, pending: pendingLabel, disabled,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  pending: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-5">
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="field-label">{f.label}</label>
          <input
            id={f.name} name={f.name} type={f.type} required autoComplete={f.autoComplete}
            disabled={disabled} aria-describedby={state?.error ? "form-error" : undefined}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint={f.type === "password" ? "go" : "next"}
            className="field-input"
          />
        </div>
      ))}
      {state?.error && (
        <p id="form-error" role="alert" className="flex items-start gap-2 rounded-lg border border-negative bg-negative-soft px-3 py-2.5 text-sm text-negative">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{state.error}
        </p>
      )}
      <button
        type="submit" disabled={pending || disabled}
        className="btn btn-primary w-full"
      >
        {pending ? pendingLabel : submit}
      </button>
    </form>
  );
}
