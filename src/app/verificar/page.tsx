import Link from "next/link";
import { AuthCard, Notice } from "@/components/auth/auth-card";
import { VerifyForm } from "@/components/auth/verify-form";
import { missingAuthEnv } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificar correo · Auto-Bank" };

export default async function VerificarPage({ searchParams }: { searchParams: Promise<{ email?: string; enviado?: string }> }) {
  const sp = await searchParams;
  const missing = missingAuthEnv();
  const email = (sp.email ?? "").slice(0, 254);
  return (
    <AuthCard title="Verifica tu correo">
      {missing.length > 0 ? (
        <Notice>La autenticación no está configurada. Faltan las variables de entorno: {missing.join(", ")}.</Notice>
      ) : (
        <>
          <Notice>
            {sp.enviado ? "Te enviamos un código de 6 dígitos por correo. " : ""}
            Ingresa el código para activar la cuenta de propietario. Vence en unos minutos.
          </Notice>
          <VerifyForm email={email} />
        </>
      )}
      <p className="mt-4 text-sm"><Link href="/login" className="font-medium text-primary underline">Volver a iniciar sesión</Link></p>
    </AuthCard>
  );
}
