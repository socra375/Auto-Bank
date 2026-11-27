"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { inputCls } from "@/components/ui/fields";
import {
  createWatchlistAction, deleteWatchlistAction, removeWatchlistItemAction, renameWatchlistAction,
} from "@/lib/actions/market";
import type { WatchlistRow } from "@/server/market/service";

/** Create / rename / delete lists and remove symbols. Lists are not financial data; nothing here moves money. */
export function WatchlistManager({ lists, activeId }: { lists: WatchlistRow[]; activeId?: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <ActionForm action={createWatchlistAction} submit="Crear lista" resetOnSuccess className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor="wl-new" className="mb-1 block text-sm font-medium">Nueva lista</label>
          <input id="wl-new" name="name" required maxLength={60} className={inputCls} />
        </div>
      </ActionForm>
      {lists.length === 0 && <p className="text-sm text-muted">Aún no tienes listas. Crea una y agrega símbolos desde la búsqueda.</p>}
      <ul className="grid gap-3">
        {lists.map((l) => (
          <li key={l.id} className={`rounded-xl border bg-surface p-3 ${l.id === activeId ? "border-primary" : "border-border"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/mercados?vista=listas&lista=${l.id}`} className="font-semibold underline-offset-2 hover:underline">{l.name}</Link>
              <span className="text-xs text-muted">{l.symbols.length} símbolo(s)</span>
            </div>
            {l.symbols.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {l.symbols.map((s) => (
                  <li key={s} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    {s}
                    <button type="button" disabled={pending} aria-label={`Quitar ${s} de ${l.name}`} className="rounded p-0.5 hover:bg-bg"
                      onClick={() => start(async () => { await removeWatchlistItemAction(l.id, s); })}>
                      <Trash2 className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <ActionForm action={renameWatchlistAction.bind(null, l.id)} submit="Renombrar" variant="ghost" className="flex items-end gap-2">
                <input aria-label={`Nuevo nombre para ${l.name}`} name="name" required maxLength={60} defaultValue={l.name} className={inputCls} />
              </ActionForm>
              <ActionForm action={deleteWatchlistAction.bind(null, l.id)} submit="Eliminar lista" variant="danger" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
