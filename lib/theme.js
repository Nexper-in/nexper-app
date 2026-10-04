"use client";

import { useCallback, useEffect, useState } from "react";

// Night is the default look (matches nexper.in); Light is a per-device
// choice for bright shop counters. Stored on this device only, so the
// owner's phone and the counter tablet can differ. The inline script in
// app/layout.js applies it before the first paint.
export const THEME_KEY = "nexper.theme";
export const THEMES = ["dark", "light"];

export function readTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return THEMES.includes(t) ? t : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#fcfbff" : "#08070f");
}

export function useTheme() {
  const [theme, setThemeState] = useState("dark");

  useEffect(() => {
    setThemeState(readTheme());
  }, []);

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    applyTheme(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme, toggleTheme: () => setTheme(theme === "light" ? "dark" : "light") };
}

// Runs inline in <head> before React loads (see app/layout.js).
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"){document.documentElement.dataset.theme="light";}}catch(e){}`;
