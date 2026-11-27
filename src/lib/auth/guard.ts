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
  let isOwner = false;
  try {
    isOwner = await claim(String(userId), data?.user?.email);
  } catch {
    redirect("/login");
  }
  if (!isOwner) redirect("/acceso-denegado");
  return String(userId);
}
