export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-text md:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted [text-wrap:pretty]">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
