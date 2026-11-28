// One-off generator for the favicon (src/app/icon.svg). Run: npx vitest run --config scripts/preview/vitest.config.mts scripts/preview/icons.test.tsx
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import { Logo } from "@/components/brand/logo";

it("writes icon svg", () => {
  const svg = renderToStaticMarkup(<Logo variant="mark" panel size={512} />)
    .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/ style="[^"]*"/, "")
    .replace(/ role="img" aria-label="Auto-Bank"/, "").replace(/ aria-hidden="true"/g, "");
  fs.writeFileSync(path.resolve(import.meta.dirname, "../../src/app/icon.svg"), svg);
});
