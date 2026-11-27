"use client";

import { useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { applyTheme, savePref, THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; hint: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Claro", hint: "Predeterminado", Icon: Sun },
  { value: "dark", label: "Oscuro", hint: "Menos brillo", Icon: Moon },
  { value: "system", label: "Sistema", hint: "Sigue tu dispositivo", Icon: Monitor },
];

/** Saves the choice in a cookie (read on the server to set <html data-theme>) and applies it immediately. No inline scripts. */
export function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    savePref(THEME_COOKIE, t);
  };
  return (
    <fieldset>
      <legend className="field-label">Tema</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map(({ value, label, hint, Icon }) => (
          <label key={value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border-strong p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
            <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => choose(value)} className="size-5 shrink-0" />
            <Icon className="size-5 shrink-0 text-muted" aria-hidden />
            <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
