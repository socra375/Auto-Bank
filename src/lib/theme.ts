export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "ab-theme";
export const SIDEBAR_COOKIE = "ab-sidebar";

/** Light is the default; anything unknown falls back to it. */
export const parseTheme = (v: string | undefined): Theme => ((THEMES as readonly string[]).includes(v ?? "") ? (v as Theme) : "light");

/** Client-side preference cookie (1 year). Non-sensitive; read by the server layouts. */
export function savePref(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}
