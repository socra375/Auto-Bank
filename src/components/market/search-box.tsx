"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { addWatchlistItemAction, toggleFavoriteAction } from "@/lib/actions/market";
import { inputCls } from "@/components/ui/fields";
import type { SearchResult } from "@/server/market/types";
import { REASON_TEXT } from "./parts";

/** Debounced provider search. Results are provider symbols; nothing is added unless the owner clicks. */
export function SearchBox({ lists }: { lists: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) return;
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/market/search?q=${encodeURIComponent(term.slice(0, 40))}`, { signal: ctl.signal, cache: "no-store" });
        if (!r.ok) throw new Error();
        setRes(((await r.json()) as { result: SearchResult }).result);
      } catch {
        if (!ctl.signal.aborted) setRes({ hits: [], reason: "provider_error", detail: null });
      }
    }, 450);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q]);

  const run = (p: Promise<{ ok?: string; error?: string } | null>) =>
    start(async () => { const s = await p; setMsg(s?.error ?? s?.ok ?? null); });

  const shown = q.trim() ? res : null;
  return (
    <section aria-labelledby="mk-search" className="card mb-4 !p-4">
      <label id="mk-search" htmlFor="mk-q" className="field-label">Buscar símbolo</label>
      <input id="mk-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={40} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" placeholder="Ej.: AAPL, Bitcoin, EUR/USD" className={inputCls} />
      <div aria-live="polite" className="mt-2 text-sm">
        {msg && <p className="mb-2 text-muted">{msg}</p>}
        {shown?.reason && <p className="text-muted">{REASON_TEXT[shown.reason]}</p>}
        {shown && !shown.reason && shown.hits.length === 0 && <p className="text-muted">Sin resultados del proveedor.</p>}
        {shown && shown.hits.length > 0 && (
          <ul className="card-flat divide-y divide-border overflow-hidden">
            {shown.hits.map((h) => (
              <li key={`${h.symbol}-${h.exchange}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                <Link href={`/mercados?simbolo=${encodeURIComponent(h.symbol)}`} className="min-w-0 underline-offset-2 hover:underline">
                  <span className="font-semibold">{h.symbol}</span> <span className="text-muted">{h.name}{h.exchange ? ` · ${h.exchange}` : ""}</span>
                </Link>
                <span className="flex items-center gap-2">
                  <button type="button" disabled={pending} onClick={() => run(toggleFavoriteAction(h.symbol))} aria-label={`Alternar favorito ${h.symbol}`} className="icon-btn">
                    <Star className="size-5" aria-hidden />
                  </button>
                  {lists.length > 0 && (
                    <select aria-label={`Agregar ${h.symbol} a una lista`} defaultValue="" disabled={pending} className="field-input !w-auto text-sm"
                      onChange={(e) => { if (e.target.value) run(addWatchlistItemAction(e.target.value, h.symbol)); e.target.value = ""; }}>
                      <option value="">Agregar a lista…</option>
                      {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
