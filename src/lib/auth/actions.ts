"use server";

import { redirect } from "next/navigation";
import { claim, getAuth, missingAuthEnv, ownerExists } from "./server";

export type FormState = { error: string } | null;

const CONFIG = "La autenticación no está configurada en este entorno.";
const NETWORK = "No se pudo contactar el servicio de autenticación. Inténtalo de nuevo.";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isNetwork = (e?: { code?: string } | null) => !!e?.code?.startsWith("NETWORK_");

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  if (missingAuthEnv().length) return { error: CONFIG };
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Ingresa tu correo y tu contraseña." };
  const { error } = await getAuth().signIn.email({ email, password });
  if (error) return { error: isNetwork(error) ? NETWORK : "Correo o contraseña incorrectos." };
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
  const auth = getAuth();
  const { data, error } = await auth.signUp.email({ name, email, password });
  if (error || !data?.user?.id) {
    return { error: isNetwork(error) ? NETWORK : "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo." };
  }
  if (!(await claim(String(data.user.id), data.user.email))) {
    await auth.signOut();
    return { error: "Este correo no está autorizado como propietario de esta instalación." };
  }
  redirect("/overview");
}

export async function signOutAction(): Promise<void> {
  if (!missingAuthEnv().length) await getAuth().signOut();
  redirect("/login");
}
