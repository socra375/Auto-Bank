import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

export function EmptyState({
  title, description, icon: Icon = Inbox, action,
}: {
  title: string; description?: string; icon?: LucideIcon; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong/60 bg-surface px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary-soft text-primary"><Icon className="size-6" aria-hidden /></span>
      <h2 className="section-title">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-muted [text-wrap:pretty]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Loader2 className="spin size-4" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** Skeleton placeholder for route-level loading (cards + table). Announced once via the status label. */
export function PageSkeleton({ label = "Cargando…" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div aria-hidden>
        <div className="skeleton mb-2 h-8 w-48" />
        <div className="skeleton mb-6 h-4 w-72 max-w-full" />
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="skeleton h-44" />)}
        </div>
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Algo salió mal", description, onRetry,
}: {
  title?: string; description?: string; onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-negative/50 bg-surface px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-negative-soft text-negative"><AlertTriangle className="size-6" aria-hidden /></span>
      <h2 className="section-title">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {onRetry && <button type="button" onClick={onRetry} className="btn btn-primary mt-5">Reintentar</button>}
    </div>
  );
}
