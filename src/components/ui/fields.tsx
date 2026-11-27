import { cn } from "@/lib/utils";

export const inputCls = "w-full rounded-md border border-border bg-surface px-3 py-2 text-base";

export function Field({
  label, id, hint, className, children,
}: { label: string; id: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Disclosure({ summary, children, className }: { summary: string; children: React.ReactNode; className?: string }) {
  return (
    <details className={cn("rounded-xl border border-border bg-surface", className)}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">{summary}</summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

export const CURRENCY_OPTIONS = [
  { value: "DOP", label: "DOP (peso dominicano)" },
  { value: "USD", label: "USD (dólar)" },
];
export function Options({ items, placeholder }: { items: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </>
  );
}
