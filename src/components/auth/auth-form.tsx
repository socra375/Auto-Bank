"use client";

import { useActionState } from "react";
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
    <form action={formAction} className="space-y-4" noValidate={false}>
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="mb-1 block text-sm font-medium">{f.label}</label>
          <input
            id={f.name} name={f.name} type={f.type} required autoComplete={f.autoComplete}
            disabled={disabled} aria-describedby={state?.error ? "form-error" : undefined}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base disabled:opacity-60"
          />
        </div>
      ))}
      {state?.error && (
        <p id="form-error" role="alert" className="rounded-md border border-negative px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      <button
        type="submit" disabled={pending || disabled}
        className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {pending ? pendingLabel : submit}
      </button>
    </form>
  );
}
