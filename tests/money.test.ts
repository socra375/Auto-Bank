import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, parseMoney, sumByCurrency } from "@/lib/money";

describe("money", () => {
  it("formats per currency with es-DO grouping", () => {
    expect(formatMoney(123456n, "DOP")).toBe("RD$1,234.56");
    expect(formatMoney(123456n, "USD")).toBe("US$1,234.56");
    expect(formatMoney(5n, "DOP")).toBe("RD$0.05");
    expect(formatMoney(-123456n, "USD")).toBe("-US$1,234.56");
  });

  it("parses amounts exactly and rejects bad input", () => {
    expect(parseMoney("1,234.56")).toBe(123456n);
    expect(parseMoney("10")).toBe(1000n);
    expect(parseMoney("0.5")).toBe(50n);
    expect(() => parseMoney("1.234")).toThrow();
    expect(() => parseMoney("-5")).toThrow();
    expect(() => parseMoney("abc")).toThrow();
  });

  it("never sums mixed currencies", () => {
    expect(sumByCurrency([
      { minor: 100n, currency: "DOP" },
      { minor: 250n, currency: "USD" },
      { minor: 50n, currency: "DOP" },
    ])).toEqual({ DOP: 150n, USD: 250n });
    expect(() => addMoney({ minor: 1n, currency: "DOP" }, { minor: 1n, currency: "USD" })).toThrow();
  });
});
