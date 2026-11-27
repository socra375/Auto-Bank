"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toggleFavoriteAction } from "@/lib/actions/market";
import type { MarketRow } from "@/server/market/service";
import { Change, fmtNum, fmtTs, fmtVolume, reasonText, StatusBadge } from "./parts";

const REFRESH_MS = 60_000;

/** Quote table (md+) / cards (mobile) with modest auto-refresh that pauses while the tab is hidden. */
export function QuoteBoard({ initialRows, loadedAt, scope, empty }: { initialRows: MarketRow[]; loadedAt: string; scope: string; empty?: string }) {
  /** The page keys this component by scope, so `initialRows` only seeds the first render. */
  const [rows, setRows] = useState(initialRows);
  const [refreshedAt, setRefreshedAt] = useState<string>(loadedAt);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(0);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/quotes?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { rows: MarketRow[] };
      setRows(body.rows);
      setRefreshedAt(new Date().toISOString());
      setErr(null);
    } catch {
      setErr(REFRESH_FAIL());
    }
    last.current = Date.now();
  }, [scope]);

  useEffect(() => {
    last.current = Date.now();
    const tick = () => { if (!document.hidden) void refresh(); };
    const id = setInterval(tick, REFRESH_MS);
    const vis = () => { if (!document.hidden && Date.now() - last.current >= REFRESH_MS) void refresh(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [refresh]);

  const star = (symbol: string) => {
    setRows((rs) => rs.map((r) => (r.symbol === symbol ? { ...r, favorite: !r.favorite } : r)));
    startTransition(async () => {
      const s = await toggleFavoriteAction(symbol);
      if (s?.error) { setErr(s.error); void refresh(); }
    });
  };

  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">{empty ?? "No hay símbolos."}</p>;
  const noProvider = rows.every((r) => r.quote.reason === "not_configured");

  return (
    <div>
      {noProvider && (
        <p role="status" className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          No hay proveedor de datos configurado, así que no se muestra ninguna cotización. Configura <code>MARKET_PROVIDER=twelvedata</code> y{" "}
          <code>MARKET_API_KEY</code> en el servidor. No se inventan precios.
        </p>
      )}
      {err && <p role="alert" className="mb-3 rounded-md border border-negative px-3 py-2 text-sm text-negative">{err}</p>}
      <p className="mb-2 text-xs text-muted">Última actualización: {fmtTs(refreshedAt)} (America/Santo_Domingo). Se actualiza cada minuto mientras la pestaña esté visible.</p>

      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Cotizaciones</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-2 font-medium"><span className="sr-only">Favorito</span></th>
            <th scope="col" className="py-2 pr-3 font-medium">Símbolo</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Precio</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Variación</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Máx. / Mín.</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Volumen</th>
            <th scope="col" className="py-2 pr-3 font-medium">Estado</th>
            <th scope="col" className="py-2 font-medium">Hora del proveedor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="border-b border-border align-top">
              <td className="py-2 pr-2"><StarButton row={r} onToggle={star} /></td>
              <td className="py-2 pr-3"><SymbolLink r={r} /></td>
              <td className="py-2 pr-3 text-right font-semibold">{fmtNum(r.quote.price)}{r.quote.currency && r.quote.price !== null && <span className="ml-1 text-xs font-normal text-muted">{r.quote.currency}</span>}</td>
              <td className="py-2 pr-3 text-right"><Change q={r.quote} /></td>
              <td className="py-2 pr-3 text-right">{r.quote.high === null && r.quote.low === null ? "—" : `${fmtNum(r.quote.high)} / ${fmtNum(r.quote.low)}`}</td>
              <td className="py-2 pr-3 text-right">{fmtVolume(r.quote.volume)}</td>
              <td className="py-2 pr-3"><StatusBadge status={r.quote.status} /><Reason r={r} /></td>
              <td className="py-2 text-xs text-muted">{fmtTs(r.quote.providerTs)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="grid gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.symbol} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1"><StarButton row={r} onToggle={star} /><SymbolLink r={r} /></div>
              <StatusBadge status={r.quote.status} />
            </div>
            <p className="mt-2 text-xl font-semibold">{fmtNum(r.quote.price)}{r.quote.currency && r.quote.price !== null && <span className="ml-1 text-xs font-normal text-muted">{r.quote.currency}</span>}</p>
            <p className="text-sm"><Change q={r.quote} /></p>
            {(r.quote.high !== null || r.quote.low !== null || r.quote.volume !== null) && (
              <p className="mt-1 text-xs text-muted">
                {r.quote.high !== null && <>Máx. {fmtNum(r.quote.high)} </>}{r.quote.low !== null && <>· Mín. {fmtNum(r.quote.low)} </>}{r.quote.volume !== null && <>· Vol. {fmtVolume(r.quote.volume)}</>}
              </p>
            )}
            <Reason r={r} />
            <p className="mt-1 text-xs text-muted">Hora del proveedor: {fmtTs(r.quote.providerTs)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const REFRESH_FAIL = () => "No se pudieron actualizar las cotizaciones ahora. Se muestran los últimos datos recibidos; inténtalo de nuevo en un momento.";

function SymbolLink({ r }: { r: MarketRow }) {
  return (
    <Link href={`/mercados?simbolo=${encodeURIComponent(r.symbol)}`} className="block min-w-0 underline-offset-2 hover:underline">
      <span className="block truncate font-semibold">{r.name}</span>
      {r.name !== r.symbol && <span className="block text-xs text-muted">{r.symbol}</span>}
    </Link>
  );
}

function Reason({ r }: { r: MarketRow }) {
  const t = reasonText(r.quote);
  return t ? <p className="mt-1 max-w-xs text-xs text-muted">{t}</p> : null;
}

export function StarButton({ row, onToggle }: { row: { symbol: string; favorite: boolean }; onToggle: (s: string) => void }) {
  return (
    <button
      type="button" onClick={() => onToggle(row.symbol)} aria-pressed={row.favorite}
      aria-label={row.favorite ? `Quitar ${row.symbol} de favoritos` : `Agregar ${row.symbol} a favoritos`}
      className="rounded-md p-1.5 hover:bg-bg"
    >
      <Star className={`size-4 ${row.favorite ? "fill-current text-primary" : "text-muted"}`} aria-hidden />
    </button>
  );
}
