// Stubs for modules that only exist on the server (server actions) or need the Next runtime, so real components render in plain Node.
import { vi } from "vitest";

const stub = vi.hoisted(() => {
  // Server actions are only referenced, never called, while rendering static markup: any export resolves to a no-op.
  return (): Record<string, unknown> => new Proxy({ __esModule: true } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : typeof k === "string" && k !== "then" ? async () => null : undefined),
    has: () => true,
  });
});
vi.mock("@/lib/actions/accounts", stub);
vi.mock("@/lib/actions/assets", stub);
vi.mock("@/lib/actions/categories", stub);
vi.mock("@/lib/actions/eddie", stub);
vi.mock("@/lib/actions/loans", stub);
vi.mock("@/lib/actions/market", stub);
vi.mock("@/lib/actions/movements", stub);
vi.mock("@/lib/actions/rates", stub);
vi.mock("@/lib/auth/actions", stub);
vi.mock("next/navigation", () => ({
  usePathname: () => (globalThis as { __PATH__?: string }).__PATH__ ?? "/overview",
  useRouter: () => ({}), redirect: () => undefined, notFound: () => undefined,
}));
