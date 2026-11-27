// Renders every preview screen to static HTML (scripts/preview/out/html/<name>.html). Run via run.sh.
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import { AppShell, SCREENS } from "./screens";

it("renders preview screens", () => {
  const dir = path.resolve(import.meta.dirname, "out/html");
  fs.mkdirSync(dir, { recursive: true });
  for (const s of SCREENS) {
    (globalThis as { __PATH__?: string }).__PATH__ = s.path;
    const html = renderToStaticMarkup(s.shell ? <AppShell>{s.node}</AppShell> : <>{s.node}</>);
    fs.writeFileSync(path.join(dir, `${s.name}.html`), html);
  }
});
