"use client";

import { useActionState } from "react";
import { resendCodeAction, verifyEmailAction } from "@/lib/auth/actions";

const input = "field-input";

export function VerifyForm({ email }: { email: string }) {
  const [state, verify, pending] = useActionState(verifyEmailAction, null);
  const [resent, resend, resending] = useActionState(resendCodeAction, null);
  return (
    <form action={verify} className="space-y-5">
      <div>
        <label htmlFor="email" className="field-label">Correo electrónico</label>
        <input id="email" name="email" type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} defaultValue={email} className={input} />
      </div>
      <div>
        <label htmlFor="code" className="field-label">Código de 6 dígitos</label>
        <input
          id="code" name="code" type="text" required inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9 \-]*" maxLength={9} aria-describedby={state?.error ? "verify-error" : undefined}
          className={`${input} text-center text-xl tracking-[0.4em]`}
        />
      </div>
      {state?.error && (
        <p id="verify-error" role="alert" className="rounded-lg border border-negative bg-negative-soft px-3 py-2.5 text-sm text-negative">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Verificando…" : "Verificar"}
      </button>
      {resent?.error && <p role="alert" className="text-sm text-negative">{resent.error}</p>}
      {resent?.info && <p role="status" className="text-sm">{resent.info}</p>}
      <button type="submit" formAction={resend} formNoValidate disabled={resending} className="btn btn-secondary w-full">
        {resending ? "Enviando…" : "Reenviar código"}
      </button>
    </form>
  );
}
