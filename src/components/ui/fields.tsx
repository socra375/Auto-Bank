import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputCls = "field-input";

export function Field({
  label, id, hint, className, children,
}: { label: string; id: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Groups related controls under a visible legend (hybrid forms: sections instead of one long column). */
export function FieldGroup({ legend, children, className }: { legend: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 space-y-3", className)}>
      <legend className="eyebrow mb-2">{legend}</legend>
      {children}
    </fieldset>
  );
}

export function Disclosure({ summary, children, className }: { summary: string; children: React.ReactNode; className?: string }) {
  return (
    <details className={cn("group card-flat shadow-[var(--shadow-card)]", className)}>
      <summary className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
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
