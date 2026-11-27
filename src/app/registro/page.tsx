import Link from "next/link";
import { AuthCard, Notice } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { signUpAction } from "@/lib/auth/actions";
import { missingAuthEnv, ownerExists } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registro · Auto-Bank" };

export default async function RegistroPage() {
  const missing = missingAuthEnv();
  let closed = false;
  let dbError = false;
  if (!missing.length) {
    try { closed = await ownerExists(); } catch { dbError = true; }
  }
  if (closed) {
    return (
      <AuthCard title="Registro cerrado">
        <Notice>Esta instalación ya tiene propietario, por lo que el registro está cerrado.</Notice>
        <Link href="/login" className="font-medium text-primary underline">Ir a iniciar sesión</Link>
      </AuthCard>
    );
  }
  const blocked = missing.length > 0 || dbError;
  return (
    <AuthCard title="Crear cuenta propietaria">
      {missing.length > 0 && (
        <Notice>La autenticación no está configurada. Faltan las variables de entorno: {missing.join(", ")}.</Notice>
      )}
      {dbError && <Notice>No se pudo verificar si ya existe un propietario. Inténtalo más tarde.</Notice>}
      <AuthForm
        action={signUpAction} submit="Crear cuenta" pending="Creando…" disabled={blocked}
        fields={[
          { name: "name", label: "Nombre", type: "text", autoComplete: "name" },
          { name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" },
          { name: "password", label: "Contraseña (mínimo 8 caracteres)", type: "password", autoComplete: "new-password" },
        ]}
      />
      <p className="mt-4 text-sm"><Link href="/login" className="font-medium text-primary underline">Ya tengo cuenta</Link></p>
    </AuthCard>
  );
}
