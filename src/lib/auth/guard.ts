import { redirect } from "next/navigation";
import { claim, getAuth, missingAuthEnv } from "./server";

/**
 * Server-side authorization for every (app) route. Returns the owner's user id (text),
 * or redirects: no session / not configured -> /login, authenticated non-owner -> /acceso-denegado.
 * The first authenticated user claims ownership atomically.
 */
export async function requireOwner(): Promise<string> {
  if (missingAuthEnv().length) redirect("/login");
  const { data } = await getAuth().getSession();
  const userId = data?.user?.id;
  if (!userId) redirect("/login");
  let status: Awaited<ReturnType<typeof claim>> = "denied";
  try {
    status = await claim(String(userId), data?.user?.email, data?.user?.emailVerified);
  } catch {
    redirect("/login");
  }
  if (status === "unverified") redirect("/acceso-denegado?motivo=correo");
  if (status !== "owner") redirect("/acceso-denegado");
  return String(userId);
}
