"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, THEMES, type Theme } from "./theme";

function readTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "system";
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  listeners.forEach((l) => l());
}

export function ThemeControl() {
  // The server can't know the stored choice, so it renders no selection;
  // the boot script has already applied the theme itself before paint.
  const current = useSyncExternalStore(subscribe, readTheme, () => null);

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex h-6 items-center gap-px rounded-[5px] border border-border bg-surface-sunken p-px text-[11px]"
    >
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={current === t}
          onClick={() => setTheme(t)}
          className="h-full rounded-[4px] px-2 text-text-muted hover:text-text aria-pressed:bg-surface-raised aria-pressed:font-medium aria-pressed:text-accent aria-pressed:shadow-[0_0_0_1px_var(--border)]"
        >
          {t}
        </button>
      ))}
    </div>
  );
}
