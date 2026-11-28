# Motion

Everything lives in `src/styles/globals.css` (tokens at the top, the motion block at the end). Rules:

- **Opt-in**: every animation is inside `@media (prefers-reduced-motion: no-preference)` with a static default. Colour/background transitions (hover, focus) stay on for everyone because they are not movement.
- **GPU only**: `opacity`, `translate`, `scale`, `transform` (shimmer, press, lift, bar growth, sheets). No layout properties are animated.
- **Durations** 120-400 ms from tokens: `--dur-fast` 140, `--dur-base` 220, `--dur-slow` 360; easings `--ease-out`, `--ease-in`, `--ease-inout`.
- **No money animation**: amounts are never counted up; figures are always the real value.
- No scripts, no libraries (CSP-safe); nothing blocks input (animations never delay interaction).

| Where | How |
|---|---|
| Route enter + section reveal | `app/(app)/template.tsx` (remounts per navigation) wraps pages in `.stagger`; children rise with a 50 ms step (max 280 ms). It also plays when a `loading.tsx` skeleton is replaced. |
| Card grids | `.stagger-fade` (opacity only) on account cards and Overview bank cards. |
| Loading | `components/states/skeletons.tsx` + one `loading.tsx` per route, mirroring the real layout (card ratio 1.586, same grids); shimmer = translating highlight, off under reduce. |
| Buttons, pills, icon buttons | hover shadow, `:active` scale 0.97. |
| Cards | `.bc` (Overview and account cards) lift 3 px and a sheen sweep on hover (hover-capable devices only); "Nueva cuenta" tile lifts and scales on press. |
| Drawer / Eddie sheet / overlay | Radix `data-state` open/closed keyframes (`data-veil`, `data-sheet`); the exit plays before unmount. |
| Disclosure | content rises on open, chevron rotates (`transition-transform`, disabled under reduce). |
| Charts | `.chart-bar` grows from its baseline (`scaleY`), `.grow-x` for share bars. |
| Forms | field focus ring transitions; success/error messages pop in (`.feedback`). |
| Mobile tab bar | the active indicator scales in. |

**View Transitions**: Next 16 / React 19.3 ship `<ViewTransition>` (see `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`), but it is partly supported in Safari and would double up with the CSS reveal, so routes use the CSS-only approach. It can be added later without touching these rules (wrap the page in `<ViewTransition>`).
