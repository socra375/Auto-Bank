"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, LineSeries, createChart, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/server/market/types";

const css = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** The ONLY place `lightweight-charts` is used (lazy-loaded by SymbolDetail). Candles: up = positive, down = negative; the table view is the accessible alternative. */
export default function PriceChart({ candles, mode, label }: { candles: Candle[]; mode: "line" | "candles"; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const text = css("--muted", "#5b6b82"), grid = css("--border", "#e2e8f0");
    const pos = css("--positive", "#15966A"), neg = css("--negative", "#D94C4C"), primary = css("--primary", "#1769aa");
    const chart = createChart(el, {
      autoSize: true, height: 320,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      timeScale: { timeVisible: true, borderColor: grid }, rightPriceScale: { borderColor: grid },
    });
    if (mode === "line") {
      chart.addSeries(LineSeries, { color: primary, lineWidth: 2 }).setData(candles.map((c) => ({ time: c.t as UTCTimestamp, value: c.c })));
    } else {
      chart.addSeries(CandlestickSeries, { upColor: pos, downColor: neg, wickUpColor: pos, wickDownColor: neg, borderVisible: false })
        .setData(candles.map((c) => ({ time: c.t as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c })));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, mode]);
  return <div ref={ref} role="img" aria-label={label} className="h-80 w-full" />;
}
