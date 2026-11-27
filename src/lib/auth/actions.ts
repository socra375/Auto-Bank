"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isUnverifiedError, normalizeOtp, verifyPath } from "./verify";
import { authKeys, clientIp, isBlocked, RATE_LIMIT_MESSAGE, recordFailure, resetOnSuccess } from "./rate-limit";
import { claim, dbQuery, getAuth, missingAuthEnv, ownerExists } from "./server";

export type FormState = { error?: string; info?: string } | null;

const CONFIG = "La autenticación no está configurada en este entorno.";
const NETWORK = "No se pudo contactar el servicio de autenticación. Inténtalo de nuevo.";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const THROTTLE_ERR = "No se pudo verificar el acceso. Inténtalo de nuevo.";
const isNetwork = (e?: { code?: string } | null) => !!e?.code?.startsWith("NETWORK_");

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  if (missingAuthEnv().length) return { error: CONFIG };
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Ingresa tu correo y tu contraseña." };
  const keys = authKeys(clientIp((await headers()).get("x-forwarded-for")), email);
  try {
    if (await isBlocked(dbQuery, keys)) return { error: RATE_LIMIT_MESSAGE };
  } catch {
    return { error: THROTTLE_ERR }; // fail closed
  }
  const { error } = await getAuth().signIn.email({ email, password });
  if (error) {
    if (isNetwork(error)) return { error: NETWORK };
    if (isUnverifiedError(error)) redirect(verifyPath(email, true)); // upstream emails a fresh code on this sign-in
    try { await recordFailure(dbQuery, keys); } catch { /* the check above already ran */ }
    return { error: "Correo o contraseña incorrectos." };
  }
  try { await resetOnSuccess(dbQuery, keys); } catch { /* best effort */ }
  redirect("/overview"); // the (app) guard decides owner vs. denied
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  if (missingAuthEnv().length) return { error: CONFIG };
  // Server-side enforcement: registration is only possible while no owner exists.
  if (await ownerExists()) return { error: "El registro está cerrado: esta instalación ya tiene propietario." };
  const name = str(form, "name");
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  if (!name || !email) return { error: "Completa tu nombre y tu correo." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  const keys = authKeys(clientIp((await headers()).get("x-forwarded-for")), email);
  try {
    if (await isBlocked(dbQuery, keys)) return { error: RATE_LIMIT_MESSAGE };
  } catch {
    return { error: THROTTLE_ERR };
  }
  const auth = getAuth();
  const { data, error } = await auth.signUp.email({ name, email, password });
  if (error || !data?.user?.id) {
    if (!isNetwork(error)) { try { await recordFailure(dbQuery, keys); } catch { /* see above */ } }
    return { error: isNetwork(error) ? NETWORK : "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo." };
  }
  if (data.user.emailVerified !== true) redirect(verifyPath(email, true)); // a code was emailed; the claim happens after verification
  const status = await claim(String(data.user.id), data.user.email, data.user.emailVerified);
  if (status !== "owner") {
    await auth.signOut();
    return { error: "Este correo no está autorizado como propietario de esta instalación." };
  }
  redirect("/overview");
}

export async function signOutAction(): Promise<void> {
  if (!missingAuthEnv().length) await getAuth().signOut();
  redirect("/login");
}

/** The server SDK exposes these endpoints at runtime (API_ENDPOINTS.emailOtp) but types them as unknown. */
const otp = () => (getAuth() as unknown as {
  emailOtp: {
    verifyEmail(a: { email: string; otp: string }): Promise<{ error: { code?: string } | null }>;
    sendVerificationOtp(a: { email: string; type: "email-verification" }): Promise<{ error: { code?: string } | null }>;
  };
}).emailOtp;

const clientKeys = async (email: string, scope: string) =>
  authKeys(clientIp((await headers()).get("x-forwarded-for")), email, scope);

/** Verifies the emailed 6-digit code. Wrong codes are throttled (5 per 15 min per email+IP). Success signs the user in. */
export async function verifyEmailAction(_: FormState, form: FormData): Promise<FormState> {
  if (missingAuthEnv().length) return { error: CONFIG };
  const email = str(form, "email");
  const code = normalizeOtp(String(form.get("code") ?? ""));
  if (!email) return { error: "Ingresa tu correo." };
  if (!code) return { error: "El código tiene 6 dígitos." };
  const keys = await clientKeys(email, "verify:");
  try {
    if (await isBlocked(dbQuery, keys)) return { error: RATE_LIMIT_MESSAGE };
  } catch {
    return { error: THROTTLE_ERR };
  }
  const { error } = await otp().verifyEmail({ email, otp: code });
  if (error) {
    if (isNetwork(error)) return { error: NETWORK };
    try { await recordFailure(dbQuery, keys); } catch { /* the check above already ran */ }
    return { error: "Código incorrecto o vencido. Revisa tu correo o pide uno nuevo." };
  }
  try { await resetOnSuccess(dbQuery, keys); } catch { /* best effort */ }
  redirect("/overview"); // requireOwner() makes the claim now that emailVerified is true
}

/** Sends a new code. Throttled separately (5 per 15 min per email+IP). Same answer whether or not the email exists. */
export async function resendCodeAction(_: FormState, form: FormData): Promise<FormState> {
  if (missingAuthEnv().length) return { error: CONFIG };
  const email = str(form, "email");
  if (!email) return { error: "Ingresa tu correo." };
  const keys = await clientKeys(email, "resend:");
  try {
    if (await isBlocked(dbQuery, keys)) return { error: RATE_LIMIT_MESSAGE };
    await recordFailure(dbQuery, keys); // every send counts
  } catch {
    return { error: THROTTLE_ERR };
  }
  const { error } = await otp().sendVerificationOtp({ email, type: "email-verification" });
  if (error && isNetwork(error)) return { error: NETWORK };
  return { info: "Si el correo está registrado, te enviamos un código nuevo." };
}
