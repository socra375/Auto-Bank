/** Pure helpers for the email-OTP verification flow (kept free of Next/Neon imports so they are unit-testable). */
export const OTP_RE = /^\d{6}$/;

/** Strips spaces/dashes people paste ("123 456") and returns the 6-digit code, or null. */
export function normalizeOtp(raw: string): string | null {
  const c = raw.replace(/[\s-]/g, "");
  return OTP_RE.test(c) ? c : null;
}

/** Neon Auth (Better Auth) answers 403 EMAIL_NOT_VERIFIED to a password sign-in of an unverified user. */
export function isUnverifiedError(e: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === "EMAIL_NOT_VERIFIED") return true;
  return e.status === 403 && /verif/i.test(e.message ?? "");
}

export const verifyPath = (email: string, sent: boolean) =>
  `/verificar?email=${encodeURIComponent(email)}${sent ? "&enviado=1" : ""}`;
