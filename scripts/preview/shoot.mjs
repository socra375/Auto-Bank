// Wraps each rendered fragment in a page with the built CSS and screenshots it at 1280 and 390 px, light and dark.
// usage: node shoot.mjs <outDir> [screenName...]   (needs NODE_PATH to contain playwright)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = import.meta.dirname;
const outDir = process.argv[2];
const only = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });
const css = fs.readFileSync(path.join(here, "out/app.css"), "utf8");
const fontCss = [400, 500, 600, 700].filter((w) => fs.existsSync(path.join(here, `out/inter-${w}.ttf`)))
  .map((w) => `@font-face{font-family:"Inter";font-weight:${w};src:url("file://${path.join(here, `out/inter-${w}.ttf`)}")}`).join("") + `html{--font-inter:"Inter"}`;
const names = fs.readdirSync(path.join(here, "out/html")).map((f) => f.replace(".html", "")).filter((n) => !only.length || only.includes(n));
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 800, "1280"], [390, 844, "390"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await ctx.newPage();
    for (const n of names) {
      const body = fs.readFileSync(path.join(here, `out/html/${n}.html`), "utf8");
      const html = `<!doctype html><html lang="es-DO" data-theme="${theme}" class="${theme === "dark" ? "dark" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fontCss}</style><style>${css}</style></head><body>${body}</body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const full = n !== "eddie";
      if (process.env.CLIP) { const [cy, ch] = process.env.CLIP.split(",").map(Number); await page.screenshot({ path: path.join(outDir, `${n}-${tag}-${theme}-clip.png`), fullPage: true, clip: { x: 0, y: cy, width: w, height: ch } }); continue; }
      await page.screenshot({ path: path.join(outDir, `${n}-${tag}-${theme}.png`), fullPage: full });
      if (overflow > 0) console.log(`OVERFLOW ${n} ${tag} ${theme}: +${overflow}px`);
    }
    await ctx.close();
  }
}
await browser.close();
