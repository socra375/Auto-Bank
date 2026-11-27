"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { INTERVALS, RANGES, type CandleSeries, type Interval, type Range } from "@/server/market/types";
import { LoadingState } from "@/components/states/states";
import { fmtNum, fmtTs, fmtVolume, reasonText } from "./parts";

const PriceChart = dynamic(() => import("./price-chart"), { ssr: false, loading: () => <LoadingState label="Cargando gráfico…" /> });

const INTERVAL_LABEL: Record<Interval, string> = { "15min": "15 min", "1h": "1 hora", "1day": "Diario", "1week": "Semanal" };
type View = "line" | "candles" | "table";
const VIEW_LABEL: Record<View, string> = { line: "Línea", candles: "Velas", table: "Tabla" };

/** History is fetched through the owner-only, rate-limited route. Unavailable history shows an honest empty state, never a made-up series. */
export function SymbolDetail({ symbol, name }: { symbol: string; name: string }) {
  const [interval, setInterval_] = useState<Interval>("1day");
  const [range, setRange] = useState<Range>(250);
  const [view, setView] = useState<View>("line");
  const [state, setState] = useState<{ key: string; series?: CandleSeries; failed?: boolean }>({ key: "" });
  const key = `${symbol}|${interval}|${range}`;

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/market/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`, { signal: ctl.signal, cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(); return (await r.json()) as { series: CandleSeries }; })
      .then((b) => setState({ key, series: b.series }))
      .catch(() => { if (!ctl.signal.aborted) setState({ key, failed: true }); });
    return () => ctl.abort();
  }, [symbol, interval, range, key]);

  const loading = state.key !== key;
  const series = loading ? undefined : state.series;
  const candles = series?.status === "ok" ? series.candles : [];
  const last = candles.at(-1);
  const sel = "rounded-md border px-3 py-1.5 text-sm";
  const on = "border-primary bg-primary text-white", off = "border-border bg-surface";

  return (
    <section aria-labelledby="det" className="rounded-xl border border-border bg-surface p-4">
      <h2 id="det" className="text-lg font-semibold">{name}{name !== symbol && <span className="ml-2 text-sm font-normal text-muted">{symbol}</span>}</h2>
      <div className="mt-3 flex flex-wrap gap-4">
        <div role="group" aria-label="Intervalo" className="flex flex-wrap gap-1">
          {INTERVALS.map((i) => <button key={i} type="button" aria-pressed={i === interval} onClick={() => setInterval_(i)} className={`${sel} ${i === interval ? on : off}`}>{INTERVAL_LABEL[i]}</button>)}
        </div>
        <div role="group" aria-label="Cantidad de velas" className="flex flex-wrap gap-1">
          {RANGES.map((r) => <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)} className={`${sel} ${r === range ? on : off}`}>{r} velas</button>)}
        </div>
        <div role="group" aria-label="Vista" className="flex flex-wrap gap-1">
          {(Object.keys(VIEW_LABEL) as View[]).map((v) => <button key={v} type="button" aria-pressed={v === view} onClick={() => setView(v)} className={`${sel} ${v === view ? on : off}`}>{VIEW_LABEL[v]}</button>)}
        </div>
      </div>

      <div className="mt-4" aria-live="polite">
        {loading && <LoadingState label="Cargando histórico…" />}
        {!loading && (state.failed || !series) && <p className="rounded-md border border-border p-4 text-sm text-muted">No se pudo cargar el histórico ahora. Inténtalo de nuevo en un momento.</p>}
        {!loading && series && series.status === "unavailable" && (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
            Histórico no disponible. {reasonText(series) ?? ""} No se muestra ningún dato inventado.
          </p>
        )}
        {!loading && candles.length > 0 && (
          <>
            {view !== "table" && <PriceChart candles={candles} mode={view} label={`Gráfico ${view === "line" ? "de línea" : "de velas"} de ${name}, ${candles.length} velas`} />}
            {view === "table" && <HistoryTable candles={candles} />}
            <p className="mt-2 text-xs text-muted">
              {candles.length} velas · última vela: {last ? fmtTs(new Date(last.t * 1000).toISOString()) : "—"} (America/Santo_Domingo) · proveedor: {series?.provider}. Histórico del proveedor; no es una cotización en vivo.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function HistoryTable({ candles }: { candles: CandleSeries["candles"] }) {
  const rows = [...candles].reverse().slice(0, 200);
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Velas OHLC, de la más reciente a la más antigua</caption>
        <thead className="sticky top-0 bg-surface text-xs text-muted">
          <tr>{["Fecha", "Apertura", "Máximo", "Mínimo", "Cierre", "Volumen"].map((h, i) => <th key={h} scope="col" className={`py-1 pr-3 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.t} className="border-t border-border">
              <th scope="row" className="py-1 pr-3 text-left font-normal">{fmtTs(new Date(c.t * 1000).toISOString())}</th>
              <td className="py-1 pr-3 text-right">{fmtNum(c.o)}</td><td className="py-1 pr-3 text-right">{fmtNum(c.h)}</td>
              <td className="py-1 pr-3 text-right">{fmtNum(c.l)}</td><td className="py-1 pr-3 text-right">{fmtNum(c.c)}</td>
              <td className="py-1 text-right">{fmtVolume(c.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
