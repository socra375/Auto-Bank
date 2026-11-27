import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Notice } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { signInAction } from "@/lib/auth/actions";
import { getAuth, missingAuthEnv, ownerExists } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Iniciar sesión · Auto-Bank" };

export default async function LoginPage() {
  const missing = missingAuthEnv();
  let registrationOpen = false;
  if (!missing.length) {
    const { data } = await getAuth().getSession();
    if (data?.user) redirect("/overview");
    try { registrationOpen = !(await ownerExists()); } catch { /* DB unreachable: keep sign-in usable */ }
  }
  return (
    <AuthCard title="Iniciar sesión">
      {missing.length > 0 && (
        <Notice>
          La autenticación no está configurada. Faltan las variables de entorno: {missing.join(", ")}.
        </Notice>
      )}
      <AuthForm
        action={signInAction} submit="Entrar" pending="Entrando…" disabled={missing.length > 0}
        fields={[
          { name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" },
          { name: "password", label: "Contraseña", type: "password", autoComplete: "current-password" },
        ]}
      />
      {registrationOpen && (
        <p className="mt-4 text-sm">
          ¿Primera vez? <Link href="/registro" className="font-medium text-primary underline">Crear la cuenta propietaria</Link>
        </p>
      )}
    </AuthCard>
  );
}
