"use client";

import { useEffect, useState } from "react";

import { t } from "@/lib/i18n";

import { Button } from "./button";

type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * The manual toggle from design-system.md's dark-mode requirement.
 *
 * Starts assuming "light" — correct for the server render, and corrected on
 * mount by reading the class `theme-script.tsx` already applied. That's a
 * one-frame icon guess, not the theme flash the bootstrap script exists to
 * prevent: the page's actual colors are never wrong, only this button's own
 * icon might repaint once.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={t("theme.switchTo", { mode: theme === "dark" ? t("theme.light") : t("theme.dark") })}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </Button>
  );
}
