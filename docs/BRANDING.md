# Branding

## What is in the app today
The logo is an **original inline SVG approximation** of the owner's artwork (dark scene, orange 3D "A" crossed by an orbit with a sparkle, three growth bars, wordmark "Auto-Bank", tagline "CONTROLA · ORGANIZA · CRECE"). It is not the owner's file.

- `src/components/brand/logo.tsx`: the single `Logo` component. Props: `variant` (`mark` | `horizontal` | `full`), `size` (height in px), `panel` (draws the near-black scene behind the artwork; use it on light backgrounds), `decorative` (hide from assistive tech when the name is written next to it), `className`, `title`. The accessible name is "Auto-Bank" on the `<svg>`; the drawing groups are `aria-hidden`.
- `src/components/brand/wordmark-paths.ts`: the wordmark and tagline converted to **paths** (Inter Display Black Italic and Inter SemiBold, SIL OFL 1.1), so no font is loaded for the logo.
- `src/app/icon.svg` (favicon, generated from `<Logo variant="mark" panel>` with `scripts/preview/icons.test.tsx`) and `src/app/apple-icon.png` (180 px render of the same icon).
- Used in: sidebar and mobile drawer, mobile top bar, `/login`, `/registro`, `/verificar`, `/acceso-denegado` (via `AuthCard`), and the Overview/account cards (decorative mark).

Palette rule: orange/gold belongs to the logo only. UI colours stay navy `#102A43`, bank blue `#1769AA`, positive `#15966A`, negative `#D94C4C`; never use the logo's orange for buttons, links or active states.

## Swapping in the owner's original file
1. Put the files in `public/brand/` (for example `logo-mark.svg`, `logo-horizontal.svg`, `logo-full.svg`; SVG preferred, PNG at 2x/3x otherwise).
2. Edit only `src/components/brand/logo.tsx`: render `<img src="/brand/logo-<variant>.svg" alt={title} width=… height={size}>` (or `next/image`) per variant instead of the SVG drawing, keeping the same props. For a light background keep the `panel` behaviour (a dark rounded wrapper) unless the original already has its own dark background. CSP allows `img-src 'self'`, so same-origin files work with no config change.
3. Replace `src/app/icon.svg` (or `icon.png`) and `src/app/apple-icon.png` with the original mark.
4. Delete `wordmark-paths.ts` if it is no longer used. No other file needs to change: every usage goes through `Logo`.
