import { cn } from "@/lib/utils";

/**
 * Building blocks for route-level loading.tsx files. Each skeleton mirrors the real layout of its page (same grids, card ratios
 * and spacing) so nothing shifts when the content arrives. The shimmer is CSS only and off under prefers-reduced-motion.
 */
export function Skel({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

/** role=status wrapper: announced once through the visually hidden label; the drawing itself is aria-hidden. */
export function SkeletonPage({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

export function SkHeader({ action }: { action?: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl">
        <Skel className="mb-2 h-8 w-48" />
        <Skel className="h-4 w-72 max-w-full" />
      </div>
      {action && <Skel className="h-11 w-full sm:w-72" />}
    </div>
  );
}

export function SkPills({ n = 4 }: { n?: number }) {
  return <div className="mb-4 flex gap-2 overflow-hidden">{Array.from({ length: n }, (_, i) => <Skel key={i} className="h-10 w-24 shrink-0 !rounded-full" />)}</div>;
}

/** Two bank cards (ISO ratio) + their period strip, like Overview. */
export function SkBankCards() {
  return (
    <div className="mb-10 grid gap-5 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i}>
          <Skel className="skeleton-card w-full" />
          <Skel className="mx-2 mt-2.5 h-[4.25rem] !rounded-2xl max-sm:mx-0" />
        </div>
      ))}
    </div>
  );
}

/** Account cards: card face + tray, three columns on desktop, one on phones. */
export function SkAccountGrid({ n = 3 }: { n?: number }) {
  return (
    <div className="ac-grid">
      {Array.from({ length: n }, (_, i) => (
        <div key={i}>
          <Skel className="skeleton-card w-full" />
          <Skel className="mx-2 mt-2.5 h-28 !rounded-2xl max-sm:mx-0" />
        </div>
      ))}
    </div>
  );
}

export function SkCards({ n = 2, h = "h-40", cols = "md:grid-cols-2" }: { n?: number; h?: string; cols?: string }) {
  return <div className={cn("mb-6 grid gap-4", cols)}>{Array.from({ length: n }, (_, i) => <Skel key={i} className={cn("!rounded-xl", h)} />)}</div>;
}

export function SkTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card-flat overflow-hidden">
      <Skel className="h-11 !rounded-none" />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-3.5"><Skel className="h-4 w-20" /><Skel className="h-4 flex-1" /><Skel className="h-4 w-24" /></div>)}
    </div>
  );
}

export function SkFilters() {
  return <Skel className="mb-4 h-36 !rounded-xl sm:h-24" />;
}

export function SkForm() {
  return <Skel className="mb-6 h-11 !rounded-xl" />;
}
