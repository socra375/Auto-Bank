import { AuthCard } from "@/components/auth/auth-card";
import { UNVERIFIED_MESSAGE } from "@/lib/auth/owner";
import { signOutAction } from "@/lib/auth/actions";

export const metadata = { title: "Acceso denegado · Auto-Bank" };

export default async function AccesoDenegado({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const unverified = (await searchParams).motivo === "correo";
  return (
    <AuthCard title="Acceso denegado">
      <p className="mb-4 text-sm">
        {unverified
          ? UNVERIFIED_MESSAGE
          : "Tu cuenta no es la propietaria de esta instalación de Auto-Bank, por lo que no puedes ver sus datos."}
      </p>
      <form action={signOutAction}>
        <button type="submit" className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-white">
          Cerrar sesión
        </button>
      </form>
    </AuthCard>
  );
}
