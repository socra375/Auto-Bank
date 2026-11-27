// Compiles src/styles/globals.css with the app's own Tailwind/PostCSS setup -> out/app.css
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(root, "package.json"));
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const src = path.join(root, "src/styles/globals.css");
const out = path.join(import.meta.dirname, "out");
fs.mkdirSync(out, { recursive: true });
const res = await postcss([tailwind({ base: root })]).process(fs.readFileSync(src, "utf8"), { from: src });
fs.writeFileSync(path.join(out, "app.css"), res.css);
console.log("css", res.css.length, "bytes");
