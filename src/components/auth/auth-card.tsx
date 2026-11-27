import type { ReactNode } from "react";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="contenido" className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span aria-hidden className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-white">AB</span>
          <span className="text-lg font-bold">Auto-Bank</span>
        </div>
        <h1 className="mb-4 text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="mb-4 rounded-md border border-border bg-bg px-3 py-2 text-sm">{children}</p>;
}
