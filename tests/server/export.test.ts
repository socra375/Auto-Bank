import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BOM, formatMajor, guardInjection, money, quote, toCsv } from "../../src/lib/csv";
import { createAccount } from "../../src/server/accounts";
import { createCategory } from "../../src/server/categories";
import { buildReportCsv } from "../../src/server/export";
import type { Executor } from "../../src/server/executor";
import { createExpense, createIncome } from "../../src/server/ledger";
import { REPORT_KEYS } from "../../src/server/report-params";
import { resolveFilters } from "../../src/server/reports";
import { liteExecutor, makeDb } from "../db/helpers";

const h = vi.hoisted(() => ({ owner: vi.fn<() => Promise<string>>(), ex: undefined as unknown as { current: unknown } }));
h.ex = { current: undefined };
vi.mock("@/lib/auth/guard", () => ({ requireOwner: h.owner }));
const getExecutor = vi.fn(() => h.ex.current);
vi.mock("@/server/db", () => ({ getExecutor: () => getExecutor() }));

import { GET } from "../../src/app/api/export/[report]/route";

describe("csv primitives", () => {
  it("quotes per RFC 4180", () => {
    expect(quote("a,b")).toBe('"a,b"');
    expect(quote('say "hi"')).toBe('"say ""hi"""');
    expect(quote("line1\nline2")).toBe('"line1\nline2"');
    expect(quote("plain")).toBe("plain");
  });
  it("neutralises formula injection in text cells", () => {
    for (const s of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx", " =1"]) expect(guardInjection(s)).toBe(`'${s}`);
    expect(guardInjection("normal")).toBe("normal");
    expect(guardInjection("a=b")).toBe("a=b");
  });
  it("writes BOM, CRLF, major units and leaves real negative numbers untouched", () => {
    const csv = toCsv(["Descripción", "Moneda", "Monto"], [["=HYPERLINK(\"x\")", "DOP", money(-123_456n)], ["ok, \"q\"", "USD", money(5n)]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}Descripción,Moneda,Monto\r\n"'=HYPERLINK(""x"")",DOP,-1234.56\r\n"ok, ""q""",USD,0.05\r\n`);
    expect(formatMajor(0n)).toBe("0.00");
    expect(formatMajor(-5n)).toBe("-0.05");
  });
});

let db: PGlite;
let ex: Executor;
const A = "user_a";
const B = "user_b";
const f = resolveFilters({ dateFrom: "2026-03-01", dateTo: "2026-03-31" }, "2026-03-31");

beforeEach(async () => {
  db = await makeDb();
  ex = liteExecutor(db);
  h.ex.current = ex;
  h.owner.mockReset();
  getExecutor.mockClear();
  const dop = (await createAccount(ex, A, { name: "=Banco", type: "bank", currency: "DOP", openingBalance: "100.00", openingDate: "2026-01-01" })) as string;
  const usd = (await createAccount(ex, A, { name: "USD", type: "bank", currency: "USD", openingBalance: "100.00", openingDate: "2026-01-01" })) as string;
  const cat = (await createCategory(ex, A, { name: "Comida", kind: "expense" })) as string;
  const sal = (await createCategory(ex, A, { name: "Salario", kind: "income" })) as string;
  await createIncome(ex, A, { accountId: dop, categoryId: sal, amount: "50.00", date: "2026-03-02", description: "-sueldo, marzo" });
  await createExpense(ex, A, { accountId: dop, categoryId: cat, amount: "20.00", date: "2026-03-03", description: "super" });
  await createIncome(ex, A, { accountId: usd, categoryId: sal, amount: "9.00", date: "2026-03-04", description: "usd" });
});

const parse = (csv: string) => csv.replace(BOM, "").trim().split("\r\n").map((l) => l.split(","));

describe("buildReportCsv", () => {
  it("every report builds with a header, BOM and a Moneda column wherever amounts appear", async () => {
    for (const key of [...REPORT_KEYS, "movimientos"] as const) {
      const { csv, filename } = await buildReportCsv(ex, A, key, f);
      expect(csv.startsWith(BOM)).toBe(true);
      expect(filename).toMatch(/\.csv$/);
      expect(parse(csv)[0].some((c) => c === "Moneda")).toBe(true);
    }
  });
  it("income vs expense: totals per currency, never mixed", async () => {
    const rows = parse((await buildReportCsv(ex, A, "ingresos-gastos", f)).csv).slice(1);
    const totals = rows.filter((r) => r[1] === "Total");
    expect(totals).toEqual([["DOP", "Total", "50.00", "20.00", "30.00"], ["USD", "Total", "9.00", "0.00", "9.00"]]);
    expect(rows.every((r) => r[0] === "DOP" || r[0] === "USD")).toBe(true);
  });
  it("movements: one leg per row in its own currency; hostile text is neutralised and quoted", async () => {
    const { csv } = await buildReportCsv(ex, A, "movimientos", f);
    expect(csv).toContain(`"'-sueldo, marzo"`);
    expect(csv).toContain(`'=Banco`);
    const lines = csv.replace(BOM, "").trim().split("\r\n").slice(1);
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.endsWith(",USD,income,9.00"))).toBe(true);
    expect(lines.some((l) => l.endsWith(",DOP,expense,-20.00"))).toBe(true);
  });
  it("movements: a capped export is visibly truncated (last row) and flagged; an uncapped one is not", async () => {
    const full = await buildReportCsv(ex, A, "movimientos", f);
    expect(full.truncated).toBe(false);
    const cut = await buildReportCsv(ex, A, "movimientos", f, 2);
    expect(cut.truncated).toBe(true);
    const lines = cut.csv.replace(BOM, "").trim().split("\r\n");
    expect(lines[lines.length - 1]).toMatch(/^ARCHIVO TRUNCADO: se exportaron 2 de \d+ movimientos/);
  });
  it("only exports the requested user's data", async () => {
    const { csv } = await buildReportCsv(ex, B, "movimientos", f);
    expect(parse(csv)).toHaveLength(1); // header only
  });
});

const call = (report: string, qs = "") => GET(new Request(`http://localhost/api/export/${report}?${qs}`), { params: Promise.resolve({ report }) });

describe("GET /api/export/[report]", () => {
  it("requires the owner: a failing guard stops the request before any data access", async () => {
    h.owner.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(call("movimientos")).rejects.toThrow("NEXT_REDIRECT");
    expect(getExecutor).not.toHaveBeenCalled();
  });
  it("returns an attachment CSV scoped to the guarded user", async () => {
    h.owner.mockResolvedValue(A);
    const res = await call("ingresos-gastos", "from=2026-03-01&to=2026-03-31");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("x-export-truncated")).toBeNull();
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="auto-bank-ingresos-gastos-2026-03-01_2026-03-31\.csv"$/);
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // text() would strip the BOM, so check raw bytes
    const body = await res.text();
    expect(body).toContain("DOP,Total,50.00,20.00,30.00");
    h.owner.mockResolvedValue(B);
    expect(await (await call("ingresos-gastos", "from=2026-03-01&to=2026-03-31")).text()).not.toContain("50.00");
  });
  it("validates filters and the report name", async () => {
    h.owner.mockResolvedValue(A);
    expect((await call("ingresos-gastos", "from=nope")).status).toBe(400);
    expect((await call("ingresos-gastos", "from=2026-04-01&to=2026-03-01")).status).toBe(400);
    expect((await call("ingresos-gastos", "moneda=EUR")).status).toBe(400);
    expect((await call("ingresos-gastos", "cuenta=not-a-uuid")).status).toBe(400);
    expect((await call("secretos")).status).toBe(404);
  });
});
