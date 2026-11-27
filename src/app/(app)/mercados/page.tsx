import type { Metadata } from "next";
import Link from "next/link";
import type { SearchParams } from "@/components/finance/filters";
import { QuoteBoard } from "@/components/market/quote-board";
import { Change, fmtNum, fmtTs, reasonText, StatusBadge } from "@/components/market/parts";
import { SearchBox } from "@/components/market/search-box";
import { SymbolDetail } from "@/components/market/symbol-detail";
import { WatchlistManager } from "@/components/market/watchlist-manager";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/states/states";
import { requireOwner } from "@/lib/auth/guard";
import { safe } from "@/lib/safe";
import { getExecutor } from "@/server/db";
import { CATEGORY_LABEL, catalogName } from "@/server/market/catalog";
import { getQuotes, listWatchlists, quotesFor, type Scope } from "@/server/market/service";
import { SYMBOL_RE } from "@/server/market/symbols";
import { CATEGORIES, type Category } from "@/server/market/types";

export const metadata: Metadata = { title: "Market Watch" };
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const isCategory = (v: string | undefined): v is Category => !!v && (CATEGORIES as readonly string[]).includes(v);

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  const sp = await searchParams;
  const ex = getExecutor();
  const loadedAt = new Date().toISOString();
  const vistaRaw = first(sp.vista);
  const vista: Category | "favoritos" | "listas" = isCategory(vistaRaw) ? vistaRaw : vistaRaw === "favoritos" || vistaRaw === "listas" ? vistaRaw : "commodities";
  const symRaw = first(sp.simbolo)?.toUpperCase();
  const symbol = symRaw && SYMBOL_RE.test(symRaw) ? symRaw : undefined;

  const listsRes = await safe(listWatchlists(ex, userId));
  if (listsRes.failed) {
    return (<><PageHeader title="Market Watch" /><ErrorState title="No se pudo cargar Market Watch" description="Inténtalo de nuevo en unos segundos." /></>);
  }
  const lists = listsRes.data;
  const listId = first(sp.lista) ?? lists[0]?.id;
  const activeList = lists.find((l) => l.id === listId);

  let scope: Scope | null = null;
  let scopeKey = "";
  if (isCategory(vista)) { scope = { kind: "category", category: vista }; scopeKey = `category:${vista}`; }
  else if (vista === "favoritos") { scope = { kind: "favorites" }; scopeKey = "favorites"; }
  else if (activeList) { scope = { kind: "watchlist", id: activeList.id }; scopeKey = `watchlist:${activeList.id}`; }

  const [rowsRes, detailRes] = await Promise.all([
    scope && !symbol ? safe(getQuotes(ex, userId, scope)) : Promise.resolve(null),
    symbol ? safe(quotesFor(ex, [symbol])) : Promise.resolve(null),
  ]);

  const tabs: { key: string; label: string }[] = [
    ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c] })),
    { key: "favoritos", label: "Favoritos" }, { key: "listas", label: "Mis listas" },
  ];

  return (
    <>
      <PageHeader title="Market Watch" description="Comportamiento del mercado, independiente de cualquier broker. Solo informativo: aquí no se compra ni se vende. Cada cotización indica su estado y la hora del proveedor." />
      <SearchBox lists={lists.map((l) => ({ id: l.id, name: l.name }))} />

      <nav aria-label="Categorías" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
        {tabs.map((t) => (
          <Link key={t.key} href={`/mercados?vista=${t.key}`} aria-current={!symbol && vista === t.key ? "page" : undefined}
            className="pill">
            {t.label}
          </Link>
        ))}
      </nav>

      {symbol && (
        <div className="space-y-4">
          <Link href={`/mercados?vista=${vista}`} className="inline-block text-sm underline underline-offset-2">← Volver a la lista</Link>
          {detailRes && !detailRes.failed && detailRes.data.get(symbol) && <QuoteSummary name={catalogName(symbol) ?? symbol} q={detailRes.data.get(symbol)!} />}
          <SymbolDetail symbol={symbol} name={catalogName(symbol) ?? symbol} />
        </div>
      )}

      {!symbol && vista === "listas" && (
        <div className="space-y-6">
          <WatchlistManager lists={lists} activeId={activeList?.id} />
          {scope && rowsRes && (rowsRes.failed
            ? <ErrorState title="No se pudieron cargar las cotizaciones" description="Inténtalo de nuevo en unos segundos." />
            : <section aria-labelledby="wl-q"><h2 id="wl-q" className="mb-2 section-title">{activeList?.name}</h2>
                <QuoteBoard key={scopeKey} initialRows={rowsRes.data} loadedAt={loadedAt} scope={scopeKey} empty="Esta lista no tiene símbolos. Búscalos arriba y agrégalos." /></section>)}
        </div>
      )}

      {!symbol && vista !== "listas" && rowsRes && (rowsRes.failed
        ? <ErrorState title="No se pudieron cargar las cotizaciones" description="Inténtalo de nuevo en unos segundos." />
        : <QuoteBoard key={scopeKey} initialRows={rowsRes.data} loadedAt={loadedAt} scope={scopeKey} empty="Aún no tienes favoritos. Usa la estrella en cualquier símbolo." />)}
    </>
  );
}

function QuoteSummary({ name, q }: { name: string; q: import("@/server/market/types").Quote }) {
  const reason = reasonText(q);
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xl font-semibold">{fmtNum(q.price)}{q.currency && q.price !== null && <span className="ml-1 text-sm font-normal text-muted">{q.currency}</span>}</p>
        <StatusBadge status={q.status} />
      </div>
      <p className="text-sm"><Change q={q} /></p>
      {reason && <p className="mt-1 text-sm text-muted">{reason}</p>}
      <p className="mt-1 text-xs text-muted">{name} · Hora del proveedor: {fmtTs(q.providerTs)} · Última actualización: {fmtTs(q.fetchedAt)} (America/Santo_Domingo)</p>
    </div>
  );
}
