import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="contenido" className="grid min-h-dvh place-items-center bg-[radial-gradient(60rem_30rem_at_50%_-10%,var(--primary-soft),transparent)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo variant="horizontal" panel size={60} className="auth-logo" />
        </div>
        <div className="card !p-6 sm:!p-8 shadow-[var(--shadow-pop)]">
          <h1 className="mb-5 text-xl font-bold tracking-tight">{title}</h1>
          {children}
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-4" aria-hidden />Conexión protegida · acceso solo para el propietario</p>
      </div>
    </main>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="mb-4 rounded-lg border border-border bg-primary-soft px-3 py-2.5 text-sm">{children}</p>;
}
