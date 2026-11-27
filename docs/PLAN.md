# Auto-Bank — Implementation Plan (Stage 1 deliverable)

Repo state: `/home/user/Auto-Bank` has no commits and no files (branch `claude/affectionate-cori-2jugrh`, remote `socra375/Auto-Bank`). Greenfield.

---

## 1) Analysis

**What the product actually is:** a single-owner, double-currency (DOP/USD) personal ledger with loans, assets, market quotes and an LLM assistant. The hard parts are not UI; they are:

1. **Ledger integrity** — balances must never drift; transfers, loans and corrections must not leak into income/expense. Solved by an *append-only, entry-based ledger*: balances are always `opening_balance + SUM(entries)`, never a stored mutable number.
2. **Currency discipline** — DOP and USD are never summed. Every amount carries its currency; consolidation is a *derived view* using a recorded rate, flagged when missing.
3. **Auditable corrections** — no hard deletes of financial data. Financial edits = reversal + repost; non-financial edits = in-place + audit row.
4. **Eddie safety** — the LLM gets *tools that call the same domain services the UI uses*, scoped to the session user, read tools free, write tools only create *proposals* that a human confirms through a non-LLM endpoint.
5. **Market Watch honesty** — a provider abstraction that returns an explicit status (`realtime | delayed | unavailable`) and timestamp; no fallback fabrication, no silent symbol substitution.

**Scale assumptions:** one user (maybe a household), thousands to low hundreds of thousands of entries over years. Aggregating with SQL on indexed columns is fine; no caches/materialized balances needed (YAGNI).

**Out of scope (explicit):** trading, broker connections, bank sync/Open Banking, budgets, recurring/scheduled transactions, notifications/email reminders, attachments/receipts upload, multi-language UI, native mobile apps. (Several are listed as open questions.)

---

## 2) Stack selection

### Main language: **TypeScript** (end-to-end)

| Criterion | TypeScript (Next.js) | Python (FastAPI + React) | Go (+ React) | C#/.NET (+ React) |
|---|---|---|---|---|
| Performance | Ample for I/O-bound CRUD+aggregation; heavy math is in Postgres | Ample | Best raw, irrelevant here | Very good |
| Dev speed / ecosystem | One language front+back, shadcn/Radix, Recharts, AI SDK, Drizzle, Better Auth all first-class | Two languages, two deploys | Two languages, thinner UI/AI ecosystem | Two languages, heavier |
| Typing / maintainability | Strict TS + Zod + Drizzle inferred types: schema→service→UI typed end-to-end | Pydantic good, but FE/BE type gap | Strong but FE gap | Strong but FE gap |
| Scalability | Serverless/Fluid functions on Vercel autoscale; Postgres is the bottleneck either way | Needs separate host | Needs separate host | Needs separate host |
| Platform target (Vercel + Neon) | Native (Next.js is Vercel's primary runtime) | Python on Vercel is possible but second-class | Not a fit | Not a fit |

**Verdict:** TypeScript/Next.js is the only option that is native on Vercel, single-repo, single-deploy, and fully typed from DB to UI.

### Frameworks / libraries (each justified, nothing extra)

| Concern | Choice | Why |
|---|---|---|
| App framework | **Next.js 15 (App Router), React 19, Node runtime** | RSC for DB-backed reads without client fetch boilerplate; Server Actions for mutations; route handlers for Eddie/market/export. Native on Vercel. |
| DB | **Neon Postgres** | User has it; branching for preview/test; PITR backups built in. |
| DB driver | **`pg` (node-postgres) via Neon *pooled* URL** | Supports real interactive transactions (`BEGIN…COMMIT`), identical behaviour against local Docker Postgres for tests. Vercel Fluid compute reuses connections. (Neon HTTP driver can't do interactive transactions — rejected.) |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | SQL-first, typed, thin; easy raw SQL for reports, CHECKs, triggers in migrations. Prisma rejected: heavier, weaker raw-SQL ergonomics, extra engine. |
| Validation | **Zod** | One schema shared by forms, Server Actions, Eddie tool params. |
| Auth | **Better Auth** (email+password, DB sessions, Drizzle adapter, TOTP 2FA plugin, built-in rate limiting) | See auth section. |
| UI | **Tailwind CSS v4 + shadcn/ui (Radix primitives) + lucide icons**, Inter via `next/font` | Accessible primitives (focus, keyboard, ARIA) out of the box; tokens via CSS variables → dark mode is a variable swap. |
| Forms | **react-hook-form + Zod resolver** | Standard, minimal re-renders. |
| Charts | **Recharts** (line/bar/area/donut) + **lightweight-charts** (TradingView, Apache-2.0) only for Market Watch candles | Recharts has no proper candlestick; lightweight-charts is small and purpose-built. |
| LLM | **Vercel AI SDK (`ai`) via Vercel AI Gateway**, default model Claude (Sonnet-class) | Provider-agnostic tool calling + streaming; Gateway gives one key, usage limits, model swap without code change. |
| Tests | **Vitest** (unit + DB integration against real Postgres), **Playwright** (E2E smoke) | Fast, TS-native. |
| CI | GitHub Actions: typecheck, lint, Vitest with `postgres:16` service, Playwright on preview | |

No state-management lib (RSC + URL search params for filters), no i18n lib (UI is Spanish-only; strings live in components; `Intl` with `es-DO` for numbers/dates), no tRPC/GraphQL.

### Auth decision: Better Auth, email + password + optional TOTP, DB sessions
- **Why not OAuth-only (Google):** a finance app shouldn't depend on a Google account login being compromised/unavailable; still easy to add later (Better Auth plugin).
- **Why not Auth.js Credentials:** Auth.js discourages credentials and pushes JWT sessions with credentials; we want *revocable DB sessions*.
- **Why not Clerk/Neon Auth (hosted):** extra vendor/cost; Neon Auth is Better Auth underneath anyway — self-hosting the library keeps users table in our schema with FK integrity.
- Session: httpOnly, Secure, SameSite=Lax cookie, DB-backed, 7-day sliding expiry, revoke-all in Configuración › Seguridad. Passwords hashed (scrypt, library default). Login rate limiting on. **Signup closed** after the first user (env `ALLOW_SIGNUP=false`) — app is single-owner by default while the schema is multi-tenant-safe.

---

## 3) Architecture blueprint

### Pattern: modular monolith, layered
```
UI (RSC pages, client components)
   │  reads: call services directly in RSC     mutations: Server Actions
   ▼
Adapters  — server actions (src/app/**/actions.ts), route handlers (src/app/api/**), Eddie tools
   │  each adapter: getSession() → ctx {userId, actor:'user'|'eddie', requestId} → Zod parse → service
   ▼
Domain services (src/server/modules/*)  — all business rules, all authorization by ctx.userId,
   │                                       all writes inside db.transaction(), audit written in same tx
   ▼
Data (Drizzle schema + SQL constraints/triggers in Postgres)  — last line of defence
```
Rules:
- **Only services touch the DB.** UI, actions, route handlers and Eddie never import `db`.
- Every service function signature: `fn(ctx: Ctx, input: ValidatedInput)`; every query filters by `ctx.userId`.
- Every financial write = one DB transaction containing: transaction header + entries + audit row (+ loan/asset rows).
- External integrations (market data, LLM) behind interfaces in `src/server/integrations/*`.

### Folder structure
```
/
├─ drizzle/                       # generated SQL migrations (+ hand-written SQL for triggers/views)
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (app)/layout.tsx         # AppShell: sidebar, topbar, Eddie button
│  │  ├─ (app)/page.tsx           # Overview
│  │  ├─ (app)/movimientos/       # list, [id] detail, nuevo; ?tipo=ingreso|gasto|transferencia
│  │  ├─ (app)/ingresos|gastos|transferencias/   # thin wrappers → movimientos with fixed filter
│  │  ├─ (app)/categorias/
│  │  ├─ (app)/cuentas/  [id]/
│  │  ├─ (app)/prestamos/ [id]/
│  │  ├─ (app)/patrimonio/ [id]/
│  │  ├─ (app)/mercados/          # Market Watch
│  │  ├─ (app)/reportes/
│  │  ├─ (app)/configuracion/     # perfil, monedas/tipos de cambio, preferencias, seguridad, integraciones
│  │  └─ api/
│  │     ├─ auth/[...all]/route.ts
│  │     ├─ eddie/chat/route.ts
│  │     ├─ eddie/proposals/[id]/confirm/route.ts   (+ /reject)
│  │     ├─ market/quotes/route.ts, market/candles/route.ts, market/search/route.ts
│  │     └─ reports/export/route.ts                 # CSV
│  ├─ components/
│  │  ├─ ui/                      # shadcn primitives
│  │  ├─ shell/                   # Sidebar, MobileNav, Topbar, EddieButton/Panel
│  │  ├─ money/                   # <Money>, <MoneyInput>, <CurrencyBadge>
│  │  ├─ charts/                  # thin Recharts/lightweight-charts wrappers
│  │  └─ states/                  # EmptyState, ErrorState, Skeletons
│  ├─ server/
│  │  ├─ db/ client.ts, schema/*.ts, seed.ts
│  │  ├─ auth.ts, context.ts      # getCtx() → {userId, actor, requestId}
│  │  ├─ lib/ money.ts, fx.ts, dates.ts, errors.ts
│  │  ├─ modules/
│  │  │  ├─ audit/ service.ts
│  │  │  ├─ accounts/ service.ts schemas.ts
│  │  │  ├─ categories/
│  │  │  ├─ ledger/               # transactions + entries: post, reverse, edit, list, balances
│  │  │  ├─ loans/
│  │  │  ├─ assets/
│  │  │  ├─ fx/                   # exchange_rates CRUD + lookup
│  │  │  ├─ reports/              # overview + reports queries
│  │  │  ├─ market/               # watchlists, instruments, quote service (uses provider)
│  │  │  └─ eddie/                # tools.ts, proposals.ts, prompt.ts
│  │  └─ integrations/
│  │     ├─ market/ provider.ts (interface), twelvedata.ts, index.ts (registry)
│  │     └─ llm/ model.ts        # AI SDK model selection
│  └─ styles/globals.css         # design tokens
├─ tests/ unit/, integration/, e2e/
└─ .github/workflows/ci.yml
```

### Design tokens (globals.css, `:root` + `.dark`)
`--navy #102A43, --primary #1769AA, --bg #F4F7FA, --surface #FFFFFF, --text #172B4D, --positive #15966A, --negative #D94C4C, --border #E2E8F0`. shadcn semantic vars (`--primary`, `--background`, `--card`, `--destructive`…) mapped onto these. Sidebar uses navy. Dark theme defined from day one (variables only), toggle in Preferencias. Numbers use `font-variant-numeric: tabular-nums`.

---

## 4) Database schema (Postgres, Drizzle)

Conventions: `id uuid pk default gen_random_uuid()`; `user_id uuid not null fk users`; `created_at/updated_at timestamptz default now()`; money as `bigint` **minor units** (`*_minor`); currency as enum; value dates as `date`; timezone pref `America/Santo_Domingo`.

### Enums
```
currency            : 'DOP' | 'USD'
account_type        : 'cash' | 'bank' | 'savings' | 'digital'
record_status       : 'active' | 'archived'
category_kind       : 'income' | 'expense'
txn_type            : 'income' | 'expense' | 'transfer' | 'adjustment'
                      | 'loan_disbursement'   -- I lend money (receivable) → money leaves account
                      | 'loan_proceeds'       -- I borrow (payable) → money enters account
                      | 'loan_collection'     -- receivable repayment received
                      | 'loan_repayment'      -- payable repayment made
                      | 'reversal'
txn_status          : 'posted' | 'reversed'
entry_kind          : 'income' | 'expense' | 'transfer' | 'adjustment' | 'loan_principal' | 'loan_interest'
loan_direction      : 'receivable' | 'payable'
asset_type          : 'real_estate' | 'vehicle' | 'technology' | 'furniture' | 'other'
asset_status        : 'active' | 'disposed'
actor               : 'user' | 'eddie' | 'system'
instrument_class    : 'commodity' | 'index' | 'stock' | 'forex' | 'crypto'
proposal_status     : 'pending' | 'confirmed' | 'rejected' | 'expired'
```

### Tables

**users / sessions / accounts_auth / verifications** — Better Auth tables (generated). `users` adds `base_currency currency default 'DOP'`, `theme text`, `timezone text`.

**accounts**
| col | type | notes |
|---|---|---|
| id, user_id | | |
| name | text not null | |
| type | account_type | |
| currency | currency | **immutable after creation** (service + trigger) |
| opening_balance_minor | bigint not null default 0 | |
| opening_date | date not null | |
| description | text | |
| status | record_status default 'active' | archive = status change, never delete |
- `UNIQUE (user_id, name)`; `UNIQUE (id, user_id, currency)` (target of composite FK from entries).
- Index `(user_id, status)`.

**categories**: id, user_id, name, kind category_kind, color text, status record_status. `UNIQUE(user_id, kind, name)`. Seeded Spanish defaults on first login (Salario, Ventas, Otros ingresos / Comida, Transporte, Vivienda, Servicios, Salud, Educación, Ocio, Otros gastos). No hierarchy (YAGNI).

**transactions** (movement header — what the user sees as "un movimiento")
| col | type | notes |
|---|---|---|
| id, user_id | | `UNIQUE(id,user_id)` |
| type | txn_type | |
| date | date not null | value date |
| description | text not null | |
| notes | text | |
| category_id | uuid null fk categories | required for income/expense (CHECK by type), null otherwise; category kind must match (service) |
| loan_id | uuid null fk loans | required for loan_* types (CHECK) |
| status | txn_status default 'posted' | |
| reverses_id | uuid null unique fk transactions | set on reversal rows; unique ⇒ a txn can be reversed once |
| replaced_by_id | uuid null fk transactions | edit chain: reversed original → new version |
| fx_rate | numeric(18,6) null | only for cross-currency transfer: implied DOP per USD, informational |
| created_by | actor | |
| idempotency_key | text null | `UNIQUE(user_id, idempotency_key)` — dedupes double-submit/Eddie double-confirm |
| created_at, updated_at | | |
- CHECKs: `(type in ('income','expense')) = (category_id is not null)`; `(type like 'loan_%') = (loan_id is not null)` (reversals copy loan_id/category_id from original, CHECK adjusted to allow for `reversal`); `(type='reversal') = (reverses_id is not null)`.
- Indexes: `(user_id, date desc)`, `(user_id, type, date)`, `(loan_id)`, `(category_id)`, trigram GIN on `description` for search (pg_trgm) — or plain `ILIKE` until slow (start plain; add trgm in stage 10 if needed).

**entries** (ledger legs; **append-only**)
| col | type | notes |
|---|---|---|
| id | uuid | |
| transaction_id, user_id | | composite FK `(transaction_id,user_id) → transactions(id,user_id)` |
| account_id, currency | | composite FK `(account_id,user_id,currency) → accounts(id,user_id,currency)` ⇒ DB guarantees entry currency = account currency and same owner |
| kind | entry_kind | |
| amount_minor | bigint not null | signed: + into account, − out of account. `CHECK (amount_minor <> 0)` |
| date | date not null | copy of txn date (denormalised for index-only balance/report queries) |
- Indexes: `(account_id, date)`, `(user_id, kind, date)`, `(transaction_id)`.
- Trigger `entries_immutable`: `BEFORE UPDATE OR DELETE → RAISE`.
- Constraint trigger `check_txn_balance` (DEFERRABLE INITIALLY DEFERRED, per transaction) enforcing leg shapes:
  - income: 1 entry, kind income, >0 · expense: 1 entry, kind expense, <0
  - transfer: exactly 2 entries kind transfer, one <0 one >0, different accounts; if same currency, sum = 0
  - adjustment: 1 entry kind adjustment
  - loan_disbursement: 1 entry kind loan_principal <0 · loan_proceeds: 1 entry loan_principal >0
  - loan_collection: entries >0, kinds ⊆ {loan_principal, loan_interest}, ≤1 of each · loan_repayment: same but <0
  - reversal: entries are exact negations of the original's entries
  - all entries' currency of a loan txn = loan currency

**loans**
| col | type | notes |
|---|---|---|
| id, user_id | | |
| direction | loan_direction | |
| counterparty | text not null | person (free text; no contacts table — YAGNI) |
| principal_minor | bigint `CHECK > 0` | original amount |
| currency | currency | |
| start_date | date | |
| due_date | date null | `CHECK due_date >= start_date` |
| interest_rate_pct | numeric(7,4) null | informational annual rate; actual interest is what's recorded on payments |
| account_id | uuid null fk accounts | default account; disbursement leg posts here when `funded=true` |
| funded_from_account | boolean | false ⇒ pre-existing debt registered without a money movement |
| notes | text | |
| closed_at | timestamptz null | manual write-off/close (optional, audited) |
- Index `(user_id, direction)`, `(user_id, due_date)`.
- **Status is derived, not stored** (view `loan_balances`): `paid = SUM(principal entries of collection/repayment, net of reversals)`, `outstanding = principal_minor − |paid|`; status = `liquidado` if outstanding=0, `vencido` if due_date < today and outstanding>0, `parcial` if paid>0, else `pendiente`. Overpayment of principal rejected by service.

**assets** — id, user_id, name, type asset_type, currency, acquired_on date null, acquisition_cost_minor bigint null, description, status asset_status, disposed_on date null.
**asset_valuations** (append-only) — id, asset_id, user_id, value_minor bigint `CHECK >= 0`, valued_on date, source text (e.g. "tasación", "estimado propio"), note, created_at. Index `(asset_id, valued_on desc, created_at desc)`. Immutable trigger. Current value = latest row.

**exchange_rates** — id, user_id, base currency ('USD'), quote currency ('DOP'), rate numeric(18,6) `CHECK > 0`, effective_date date, source text ('manual' | provider name), created_at. `CHECK base <> quote`; `UNIQUE(user_id, base, quote, effective_date)`. Lookup = latest `effective_date <= as_of`. Corrections: new row for same date replaces via upsert **with audit row** (rates are reference data, not ledger).

**audit_log** (append-only, immutable trigger) — id bigserial, user_id, actor, action text (`txn.create`, `txn.reverse`, `account.archive`, `eddie.proposal.confirm`…), entity_type, entity_id uuid, before jsonb, after jsonb, request_id uuid, ip inet null, created_at. Index `(user_id, entity_type, entity_id)`, `(user_id, created_at desc)`. Serves "historial de modificaciones" for every entity.

**instruments** (global catalog, no user_id) — id, symbol text (display: `BTC/USD`), name, class instrument_class, provider_symbols jsonb (`{"twelvedata":"BTC/USD"}`), quote_currency text. `UNIQUE(symbol)`. Seeded with the 20 required instruments.
**watchlists** — id, user_id, name, is_favorites bool. Partial unique index: one favorites list per user.
**watchlist_items** — watchlist_id, instrument_id, position int. PK (watchlist_id, instrument_id).
**market_cache** — key text pk (`provider:kind:symbol:range`), payload jsonb, fetched_at timestamptz. TTL enforced in service (quotes 60s, candles 15m). Protects free-tier API quotas; payload carries the provider's own timestamp, so cached data is never presented as newer than it is.

**eddie_proposals** — id, user_id, action text (`create_income|create_expense|create_transfer`), payload jsonb (validated input), summary jsonb (rendered preview: accounts, amounts, resulting balances), status proposal_status, expires_at (10 min), result_transaction_id null, created_at, decided_at. Index `(user_id, status)`.
**eddie_messages** (optional, stage 9) — id, user_id, role, content jsonb, created_at. Only if conversation history persistence is wanted (open question; default: keep last 50 per user for context).

Views (SQL, in migrations): `account_balances` (opening + SUM entries, per account), `loan_balances` (above), `asset_current_values`.

---

## 5) Money & currency rules (binding for all code)

1. **Storage:** integer minor units (`bigint`, centavos/cents). Both DOP and USD have 2 decimals. No floats anywhere in money paths. Drizzle `bigint({mode:'number'})` + assert `Number.isSafeInteger`.
2. **Parsing/format:** `parseMoney("1,234.56") → 123456` via string ops (reject >2 decimals, reject ≤0 where sign is implied by type). `formatMoney(minor, currency)` → `Intl.NumberFormat('es-DO', {style:'currency'})` → `RD$1,234.56` / `US$1,234.56`.
3. **Sign is derived from type** (user always enters a positive amount); services set the sign. Users never type negative amounts except in `adjustment` (explicit "aumentar/disminuir").
4. **Never sum across currencies.** Every aggregate is `GROUP BY currency`. Return type of any total is `Record<Currency, number>`.
5. **Consolidation (optional view):** convert with `exchange_rates` — stocks (balances, net worth) at the rate effective on the as-of date; flows (income/expense per period) at the rate effective on each entry's date. Integer math: `round_half_away_from_zero(minor * rate_1e6 / 1e6)` using BigInt. If no applicable rate → consolidated figure shown as "Sin tipo de cambio registrado", never estimated. Consolidated numbers are always labelled with the rate and date used, and native-currency figures are always shown beside them.
6. **Cross-currency transfer:** two legs with the actual amounts sent and received (each in its account currency); `fx_rate` stored for information. No FX gain/loss accounting (YAGNI).
7. **Classification (what counts as what):**
   - Income (reports) = `entry.kind='income'` + `loan_interest` entries with amount>0.
   - Expense (reports) = `entry.kind='expense'` + `loan_interest` entries with amount<0.
   - Never income/expense: `transfer`, `adjustment`, `loan_principal`. Adjustments shown as their own line.
8. **Corrections:** amount/account/date/type/currency change ⇒ `reverse(original)` + `post(new)` in one DB tx, `original.status='reversed'`, `original.replaced_by_id=new.id`. Reversal entries carry the **original value date**, so period reports and balances net to zero exactly and history stays visible. Description/notes/category edits ⇒ in-place UPDATE on `transactions` + audit row with before/after. "Eliminar" in UI = "Anular" (reversal without replacement).
9. **Archived accounts** keep all history and balances; posting to them is rejected; they can be unarchived. An account with non-zero balance can be archived only after explicit confirmation (warning).
10. **Account currency is immutable** once created (prevents historical reinterpretation).
11. **Net worth (per currency):** `Σ account balances + Σ receivable outstanding + Σ active asset current values − Σ payable outstanding`. Shown as Bruto (accounts + receivables + assets) / Obligaciones (payables) / Neto.

---

## 6) API surface

Mutations = Server Actions (form-friendly, CSRF-protected by Next's origin check); reads = services called in RSC. Route handlers only where an HTTP endpoint is genuinely needed.

### Domain service functions (the real API; Eddie and UI both use these)
```
accounts:   list(ctx,{status?}) · get · create · update(name,type,description) · archive · unarchive · balances(ctx,{asOf?})
categories: list · create · update · archive
ledger:     createIncome · createExpense · createTransfer · createAdjustment
            · list(ctx, {from,to,types[],accountId,categoryId,currency,q,status,cursor,limit})
            · get(id) (with entries, reversal chain, audit history)
            · updateMeta(id,{description,notes,categoryId}) · correct(id, newInput) · void(id, reason)
loans:      list({direction,status}) · get (with payments + history) · create(funded?) · updateMeta
            · recordPayment(loanId,{date, accountId, principalMinor, interestMinor, notes}) · voidPayment(txnId)
assets:     list · get · create(initial valuation) · updateMeta · addValuation · dispose
fx:         list · upsertRate · getRate(asOf)
reports:    overview({from,to,currency?}) · incomeVsExpense · cashflow(granularity) · balancesByAccount
            · expensesByCategory · loansSummary · netWorthSeries · comparePeriods(a,b)
market:     listWatchlists · createWatchlist · rename · delete · addItem · removeItem · toggleFavorite
            · quotes(instrumentIds) · candles(instrumentId, range) · search(q)
audit:      historyFor(entityType, entityId)
```

### Route handlers
| Method | Path | Purpose |
|---|---|---|
| * | `/api/auth/[...all]` | Better Auth |
| POST | `/api/eddie/chat` | streaming chat (AI SDK), tools bound to session ctx |
| POST | `/api/eddie/proposals/:id/confirm` | human confirmation → executes service, audited; requires session + same user + pending + not expired + idempotency |
| POST | `/api/eddie/proposals/:id/reject` | |
| GET | `/api/market/quotes?ids=` | client polling (60s) |
| GET | `/api/market/candles?id=&range=1D\|5D\|1M\|6M\|1Y` | |
| GET | `/api/market/search?q=` | |
| GET | `/api/reports/export?report=&from=&to=&currency=&accountId=` | CSV (UTF-8 BOM for Excel) |

All handlers: `getCtx()` (401 if none) → Zod → service → typed result; errors mapped to `{code, message_es}`.

---

## 7) Provider-abstraction interfaces

### Market data
```ts
type QuoteStatus = 'realtime' | 'delayed' | 'unavailable';

interface InstrumentRef { instrumentId: string; providerSymbol: string; class: InstrumentClass }

interface Quote {
  instrumentId: string;
  status: QuoteStatus;            // 'unavailable' ⇒ all numeric fields null
  price: number | null; change: number | null; changePct: number | null;
  open?: number | null; high?: number | null; low?: number | null; volume?: number | null;
  currency: string | null;
  asOf: string | null;            // provider timestamp (ISO), never server time
  provider: string;
  reason?: string;                // e.g. 'plan_not_supported', 'rate_limited', 'symbol_not_found'
}
interface Candle { t: string; o: number; h: number; l: number; c: number; v?: number }
interface CandleSeries { instrumentId: string; status: QuoteStatus; candles: Candle[]; asOf: string | null; provider: string; reason?: string }

interface MarketDataProvider {
  readonly id: string;
  getQuotes(refs: InstrumentRef[]): Promise<Quote[]>;           // must return one Quote per ref, never throw per-symbol
  getCandles(ref: InstrumentRef, range: Range): Promise<CandleSeries>;
  search(q: string): Promise<Array<{ providerSymbol: string; name: string; class: InstrumentClass }>>;
}
```
Rules: status `realtime` only if the provider declares it for that symbol/plan *and* `asOf` age < 2 min; otherwise `delayed`; any error/missing → `unavailable` with reason. No fallback to another symbol (e.g. SPY for S&P 500) unless the catalog explicitly lists that instrument under its own name. Provider chosen by env `MARKET_PROVIDER`; adding a provider = one file + registry entry. A `NullProvider` (always `unavailable`, reason `not_configured`) is used when no API key is set — the page still works honestly.

### LLM (Eddie)
No custom interface: AI SDK's `LanguageModel` is the abstraction; `src/server/integrations/llm/model.ts` returns `gateway(process.env.EDDIE_MODEL ?? 'anthropic/claude-sonnet-4.5')` (exact id confirmed at stage 9). Swapping provider = env change.

### Eddie tool layer
```
read tools (execute immediately, scoped to ctx.userId):
  get_balances({asOf?}) · list_movements({from,to,type,accountId,categoryId,q,limit≤50})
  · get_loans({direction?,status?}) · get_net_worth({asOf?}) · get_summary({from,to})
  · list_accounts() · list_categories() · get_exchange_rate({asOf?})
write tools (never execute; create eddie_proposals row and return a preview):
  propose_income · propose_expense · propose_transfer
```
- Tools call domain services with `ctx.actor='eddie'`; Eddie has no SQL/DB access and no tool can confirm, reverse, archive, or delete.
- Write tool input is validated with the *same* Zod schemas as the UI; preview includes account names, amounts with currency, date, category, resulting balance.
- UI renders proposal as a card with "Confirmar"/"Cancelar"; confirm hits the route handler (user click ⇒ not reachable by the model). Executed via `ledger.create*` with `idempotency_key = proposal.id`, `created_by='eddie'`; audit rows for proposal created/confirmed/rejected.
- System prompt (Spanish): answer only from tool results, say "no tengo esa información" otherwise, never state a figure that wasn't returned by a tool, always show currency, never sum DOP+USD.
- Limits: max 8 tool steps per turn, per-user rate limit (e.g. 30 msgs / 10 min) via a simple DB counter or Better Auth rate limiter store.

---

## 8) Security

- Auth: Better Auth DB sessions, secure cookies, rate-limited login, optional TOTP, signup closed after owner exists, session list + revoke.
- Authorization: every service query filters by `ctx.userId`; composite FKs make cross-tenant entries impossible at DB level. IDs are UUIDs (non-enumerable) but never trusted.
- Input: Zod at every adapter boundary; DB CHECKs/triggers as backstop.
- SQL: Drizzle parameterised queries only; raw SQL via `sql\`\`` template (parameterised); no string concatenation.
- CSRF: Server Actions origin check; route handlers require same-origin + session cookie SameSite=Lax; POST only for mutations.
- Headers: CSP (self + font/chart needs), `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS (Vercel default HTTPS).
- Secrets only in Vercel env (DATABASE_URL, BETTER_AUTH_SECRET, MARKET_API_KEY, AI_GATEWAY_API_KEY).
- Integrity: transactions for every multi-row financial write; immutable ledger/audit/valuation triggers; idempotency keys.
- Backups: Neon point-in-time restore (set history retention to the plan's maximum); CSV export of all movements in Configuración; documented restore runbook. Optional: nightly `pg_dump` GitHub Action to private storage (open question).
- Least privilege: app DB role without DDL rights in production; migrations run with owner role from CI.

---

## 9) Test strategy

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | `money.ts` parse/format/rounding edge cases; `fx.ts` conversion (half-away-from-zero, BigInt); loan status derivation; market status classification; Zod schemas |
| Integration (core) | Vitest + real Postgres (Docker `postgres:16` in CI, migrated fresh per run, each test in a rolled-back tx or truncated) | Services end-to-end against DB, incl. triggers |
| E2E smoke | Playwright vs `next start` + test DB | login, create account, income, transfer, loan + payment, overview figures, Eddie proposal confirm (LLM mocked via AI SDK `MockLanguageModel`) |

**Financial-integrity test suite (must pass to call any stage done):**
1. Balance = opening + Σ entries, for every account after random sequences of operations (property-style test with seeded random ops).
2. Transfers: never appear in income/expense reports; same-currency legs sum to 0; total of all same-currency balances unchanged by transfers.
3. Cross-currency transfer: each leg in its own account currency; reports never mix currencies.
4. DB rejects: entry currency ≠ account currency; entry for another user's account; UPDATE/DELETE on entries/audit/valuations; malformed leg shapes (via constraint trigger); zero amounts.
5. Reversal: original + reversal net to exactly 0 for balances and period reports; double reversal rejected; edit chain preserved.
6. Loans: disbursement not expense; proceeds not income; principal payments not income/expense; interest counted as income (receivable) / expense (payable); overpayment rejected; status transitions pendiente→parcial→liquidado; vencido by date; voiding a payment restores outstanding.
7. Archived account: history/balance intact, posting rejected.
8. Consolidation: missing rate ⇒ null + flag, never a number; correct rate selected by date.
9. Net worth = bruto − obligaciones per currency; asset valuation history kept, latest used.
10. Eddie: read tools only return ctx user's data; write tools create proposals only (no entries); confirm by other user/expired/twice ⇒ rejected; confirm creates exactly one transaction; audit rows present.
11. Market: provider failure ⇒ `unavailable`, no numbers; cache never re-stamps `asOf`.
12. Authorization: every service called with user B's ctx on user A's ids ⇒ not found.

CI gate: `tsc --noEmit`, ESLint, Vitest (unit + integration), Playwright smoke on PRs.

---

## 10) Stages and atomic tasks

Each task ≈ one small PR-able unit. A stage is done only when its features persist to DB, its integrity tests pass, and it works on desktop + mobile width.

### Stage 1 — Inspection & architecture ✅ (this document)
1.1 Inspect repo (empty) · 1.2 Write PLAN.md · 1.3 User resolves decisions in §11.

### Stage 2 — App shell & design system
2.1 `create-next-app` (TS strict, App Router, ESLint, Tailwind v4, `src/`), pnpm, Node 22; `.nvmrc`, `.env.example`.
2.2 shadcn init; tokens in `globals.css` (light + `.dark`), Inter via `next/font`, tabular numerals.
2.3 Better Auth setup with Drizzle adapter (needs Stage 3.1 client — do 3.1 first or together); `/login` page (Spanish), middleware redirect for `(app)` routes, `ALLOW_SIGNUP` gate.
2.4 AppShell: fixed collapsible sidebar (state in cookie), grouped nav exactly per spec, topbar (period + currency filter slots, user menu), mobile bottom/compact nav + sheet.
2.5 Placeholder pages for every route showing an `EmptyState` (no fake numbers).
2.6 Shared components: `Money`, `MoneyInput`, `CurrencyBadge`, `EmptyState`, `ErrorState`, skeletons, `PageHeader`, `DataTable` (shadcn table + URL-param pagination).
2.7 Floating Eddie button (opens panel with "Disponible en etapa 9" state).
2.8 Theme toggle (light default, dark ready); a11y pass: focus rings, skip link, landmarks, labels.
2.9 CI workflow (typecheck, lint, test); Vercel project linked; Neon DB + preview branch integration.

### Stage 3 — Database & models
3.1 Drizzle config, `pg` pool client (Neon pooled URL), migration scripts (`db:generate`, `db:migrate`), local Docker Postgres compose for dev/tests.
3.2 Enums + tables: accounts, categories, transactions, entries, loans, assets, asset_valuations, exchange_rates, audit_log (market & eddie tables arrive in their stages).
3.3 Hand-written SQL migration: composite FKs, CHECKs, immutable triggers, deferred `check_txn_balance` constraint trigger, account-currency-immutable trigger.
3.4 Views: `account_balances`, `loan_balances`, `asset_current_values`.
3.5 `lib/money.ts`, `lib/fx.ts`, `lib/errors.ts`, `server/context.ts` (`getCtx`), `audit.record(tx, ctx, …)`.
3.6 Seed: default categories on first login (idempotent).
3.7 Integration test harness (fresh DB per run, helpers `makeUser`, `makeAccount`); DB-level rejection tests (§9 #4).

### Stage 4 — Accounts & movements
4.1 accounts service + Zod; Cuentas list (balances per account, grouped by currency), create/edit dialog, archive/unarchive, detail with entries & running balance.
4.2 categories service + Categorías page (CRUD, archive).
4.3 ledger service: createIncome/Expense/Adjustment/Transfer (same & cross currency) in tx with audit.
4.4 ledger list/search/filter (date range, type, account, category, currency, text, status) with cursor pagination; Movimientos page; Ingresos/Gastos/Transferencias as pre-filtered views.
4.5 Movement detail: legs, reversal chain, audit history timeline.
4.6 updateMeta, correct (reverse+repost), void; UI "Editar" routes financial changes through correct() with explanatory note.
4.7 Hybrid forms: quick-add dialog (amount, account, category, date) + full form page; keyboard submit.
4.8 Exchange rates in Configuración › Monedas (list, add, history).
4.9 Integrity tests §9 #1–5, #7, #8, #12 for this scope.

### Stage 5 — Loans & debts
5.1 loans service: create (funded → disbursement/proceeds txn; unfunded → no entries), updateMeta, recordPayment (principal + interest split, overpay guard), voidPayment (reversal).
5.2 Préstamos page: tabs Por cobrar / Por pagar, totals per currency, status badges (derived), due dates.
5.3 Loan detail: summary (original, paid, interest paid, outstanding), payment history, "Registrar abono" form, audit history.
5.4 Integrity tests §9 #6.

### Stage 6 — Patrimonio
6.1 assets service: create (+ initial valuation), updateMeta, addValuation, dispose.
6.2 Patrimonio page: assets by type, valuation history chart per asset, net-worth panel (Bruto / Obligaciones / Neto per currency + consolidated if rate).
6.3 Tests §9 #9.

### Stage 7 — Overview & reports
7.1 reports service queries (all `GROUP BY currency`): overview KPIs, cashflow series, distribution by account, upcoming due dates (loans next 30 days), latest movements.
7.2 Overview page wired to period + currency filters (URL params), quick actions (new income/expense/transfer/payment).
7.3 Reportes page: ingresos vs gastos, flujo, balances por cuenta, gastos por categoría, préstamos, deudas, patrimonio, comparación de períodos; filters fecha/moneda/cuenta.
7.4 CSV export route per report + full movements export.
7.5 Report tests: transfers/loans/adjustments excluded correctly; period comparison math; consolidated null when no rate.

### Stage 8 — Market Watch
8.1 Tables instruments, watchlists, watchlist_items, market_cache; seed 20 instruments with provider symbols.
8.2 Provider interface, NullProvider, chosen provider adapter (default Twelve Data), registry by env.
8.3 market service: quotes/candles with cache + status rules; search; watchlists & favorites.
8.4 Mercados page: grouped tables (Materias primas, Índices, Acciones, Forex, Cripto) with price, Δ, Δ%, status badge, timestamp; client polling 60s; search; favorites/lists.
8.5 Instrument detail: line/candle toggle (lightweight-charts), range selector, H/L/vol when present, explicit unavailable state.
8.6 Tests §9 #11 with a fake provider.

### Stage 9 — Eddie
9.1 eddie_proposals (+ optional eddie_messages) tables.
9.2 Tool definitions (read + propose) on top of services; system prompt (Spanish).
9.3 `/api/eddie/chat` streaming route with ctx binding, step limit, rate limit.
9.4 Panel UI (AI SDK `useChat`): messages, tool-result rendering (tables/amounts), proposal cards with Confirmar/Cancelar.
9.5 Confirm/reject routes; idempotent execution; audit.
9.6 Tests §9 #10 with mocked model; manual eval script with ~15 Spanish prompts.

### Stage 10 — Security, tests, optimisation
10.1 Security headers/CSP, TOTP enable flow, session management UI, dependency audit.
10.2 Completed Playwright smoke suite; run full integrity suite; coverage review of services.
10.3 Query review with `EXPLAIN` on reports/list; add pg_trgm index only if needed.
10.4 Accessibility audit (axe in Playwright), mobile pass on every page.
10.5 Backup/restore runbook (Neon PITR), README with setup/deploy.
10.6 Production deploy on Vercel + Neon main branch; smoke on prod.

---

## 11) Decisions only the user can make (with recommended defaults)

| # | Decision | Recommended default |
|---|---|---|
| 1 | Single-user vs multi-user | **Single owner** (signup closed after first account); schema is multi-tenant-safe so opening it later is a config change. |
| 2 | Auth method | **Email + password with optional TOTP 2FA** (Better Auth, DB sessions). Add Google sign-in later only if wanted. |
| 3 | Market data provider + API key | **Twelve Data** (one API for stocks, forex, crypto, commodities; free tier ~800 req/day, mostly delayed). Free tier likely lacks some indices (DAX, Russell) and WTI/Brent futures → shown as `unavailable` honestly. Alternatives: Finnhub, Alpha Vantage, or a paid plan. User must create the key. |
| 4 | Eddie LLM hosting | **Vercel AI Gateway → Anthropic Claude (Sonnet-class)**; needs Gateway key/billing. Alternative: direct Anthropic/OpenAI key. |
| 5 | Eddie conversation persistence | Keep last 50 messages per user in DB (default) vs. stateless per session. |
| 6 | Consolidation base currency | **DOP** for consolidated views (toggle to USD). |
| 7 | Exchange-rate source | **Manual entry** (user records rate + date). Optional later: auto-fetch from provider (stored with source). |
| 8 | Does "Disponible" include savings accounts? | **Yes**, all active accounts, with breakdown by type. |
| 9 | Receipts/attachments for loan payments & movements | **Not now** (notes field only). Later: Vercel Blob. |
| 10 | Reminders for due dates | **In-app only** (Overview "Próximos vencimientos"); no email/push. |
| 11 | Backups beyond Neon PITR | PITR + manual CSV export; optional nightly `pg_dump` Action if user provides storage. |
| 12 | Domain / Vercel project & Neon project names, region | Neon region close to DR users (e.g. `aws-us-east-1`); Vercel region `iad1` to match. |
| 13 | Interest handling | Record interest **as paid** on each payment (no automatic accrual). Rate field informational. |
| 14 | Timezone / date formats | `America/Santo_Domingo`, `dd/MM/yyyy`, `es-DO` number format. |
