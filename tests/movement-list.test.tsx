import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MovementList } from "../src/components/finance/movement-list";
import type { MovementRow } from "../src/server/ledger";

const base: MovementRow = {
  id: "11111111-1111-4111-8111-111111111111", type: "expense", date: "2026-02-01", description: "Super", notes: null, status: "posted",
  categoryId: null, categoryName: "Comida", reversesId: null, replacedById: null, loanId: null, fxRate: null, createdAt: "", legs: [],
};

describe("MovementList", () => {
  it("shows an empty state", () => {
    expect(renderToStaticMarkup(<MovementList items={[]} />)).toContain("Sin movimientos");
  });
  it("renders each amount in its own currency, never combined", () => {
    const html = renderToStaticMarkup(
      <MovementList items={[
        { ...base, legs: [{ accountId: "a", accountName: "Banco", currency: "DOP", kind: "expense", amountMinor: -123456n }] },
        { ...base, id: "22222222-2222-4222-8222-222222222222", type: "transfer", description: "Cambio", legs: [
          { accountId: "a", accountName: "Banco", currency: "DOP", kind: "transfer", amountMinor: -590000n },
          { accountId: "b", accountName: "Dólares", currency: "USD", kind: "transfer", amountMinor: 10000n },
        ] },
        { ...base, id: "33333333-3333-4333-8333-333333333333", status: "reversed", replacedById: "x", legs: [{ accountId: "a", accountName: "Banco", currency: "USD", kind: "expense", amountMinor: -500n }] },
      ]} />,
    );
    expect(html).toContain("-RD$1,234.56");
    expect(html).toContain("RD$5,900.00 → US$100.00");
    expect(html).toContain("Corregido");
    expect(html).toContain('href="/movimientos/11111111-1111-4111-8111-111111111111"');
  });
});
