"use client";

import { useActionState } from "react";
import { resendCodeAction, verifyEmailAction } from "@/lib/auth/actions";

const input = "w-full rounded-md border border-border bg-surface px-3 py-2 text-base";

export function VerifyForm({ email }: { email: string }) {
  const [state, verify, pending] = useActionState(verifyEmailAction, null);
  const [resent, resend, resending] = useActionState(resendCodeAction, null);
  return (
    <form action={verify} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Correo electrónico</label>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} className={input} />
      </div>
      <div>
        <label htmlFor="code" className="mb-1 block text-sm font-medium">Código de 6 dígitos</label>
        <input
          id="code" name="code" type="text" required inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9 \-]*" maxLength={9} aria-describedby={state?.error ? "verify-error" : undefined}
          className={`${input} tracking-widest`}
        />
      </div>
      {state?.error && (
        <p id="verify-error" role="alert" className="rounded-md border border-negative px-3 py-2 text-sm text-negative">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-white disabled:opacity-60">
        {pending ? "Verificando…" : "Verificar"}
      </button>
      {resent?.error && <p role="alert" className="text-sm text-negative">{resent.error}</p>}
      {resent?.info && <p role="status" className="text-sm">{resent.info}</p>}
      <button type="submit" formAction={resend} formNoValidate disabled={resending} className="text-sm font-medium text-primary underline disabled:opacity-60">
        {resending ? "Enviando…" : "Reenviar código"}
      </button>
    </form>
  );
}
