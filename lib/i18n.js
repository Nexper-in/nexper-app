"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import LANGUAGES from "@/i18n/languages.json";

// Languages in the app. English is the source: the English text IS the key,
// so t("New bill") returns the translation from i18n/<lang>.json, or the
// English text itself when there isn't one yet (the app never shows a blank
// or a raw key). See CLAUDE.md for the rules when adding or changing text.
//
//   const t = useT();          inside a component
//   t(text)                    plain text
//   t(text, { n: 3 })          text with {n}-style values
//
// Constant arrays that can't call the hook mark their text with T(text),
// which returns it unchanged, and translate when rendering: t(item.label).
// tools/check-i18n.mjs finds every such call and checks all languages.

export const LANGS = LANGUAGES;
export const LANG_KEY = "nexper.lang";

export function T(text) {
  return text;
}

const LoadedDicts = {};

function loadDict(code) {
  if (code === "en") return Promise.resolve({});
  if (LoadedDicts[code]) return Promise.resolve(LoadedDicts[code]);
  return import(`@/i18n/${code}.json`).then((m) => (LoadedDicts[code] = m.default || m));
}

// The app (app.nexper.in) and the website (nexper.in) are different origins, so
// localStorage can't be shared. The website's links add ?lang=, and both sites
// write a cookie on .nexper.in with the same name, so the choice follows the
// visitor. Order: ?lang=  >  shared cookie  >  this device's choice  >  phone.
const LANG_COOKIE = "nexper_lang";

function readCookie() {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(code) {
  try {
    const shared = /(^|\.)nexper\.in$/.test(location.hostname) ? "; domain=.nexper.in" : "";
    document.cookie = `${LANG_COOKIE}=${code}${shared}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
}

function detect() {
  const known = (c) => c && LANGS.some((l) => l.code === c);
  try {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (known(fromUrl)) {
      // Remember it here too, so later pages don't need the parameter.
      try {
        localStorage.setItem(LANG_KEY, fromUrl);
      } catch {}
      writeCookie(fromUrl);
      return fromUrl;
    }
  } catch {}
  const cookie = readCookie();
  if (known(cookie)) return cookie;
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (known(stored)) return stored;
  } catch {}
  const nav = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
  for (const n of nav) {
    const c = String(n).slice(0, 2).toLowerCase();
    if (LANGS.some((l) => l.code === c)) return c;
  }
  return "en";
}

function loadFont(code) {
  const lang = LANGS.find((l) => l.code === code);
  if (!lang?.font || document.getElementById(`font-${code}`)) return;
  const link = document.createElement("link");
  link.id = `font-${code}`;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${lang.font.replace(/ /g, "+")}:wght@400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

const LangContext = createContext({ lang: "en", setLang: () => {}, t: (s, v) => format(s, v) });

function format(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("en");
  const [dict, setDict] = useState({});

  const apply = useCallback((code) => {
    const meta = LANGS.find((l) => l.code === code) || LANGS[0];
    document.documentElement.lang = meta.htmlLang;
    document.documentElement.dataset.lang = meta.code;
    if (meta.font) loadFont(meta.code);
    loadDict(meta.code).then((d) => {
      setDict(d);
      setLangState(meta.code);
    });
  }, []);

  useEffect(() => {
    apply(detect());
  }, [apply]);

  const setLang = useCallback(
    (code) => {
      try {
        localStorage.setItem(LANG_KEY, code);
      } catch {}
      writeCookie(code);
      apply(code);
    },
    [apply]
  );

  const t = useCallback((text, vars) => format(dict[text] ?? text, vars), [dict]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  return useContext(LangContext).t;
}

export function useLang() {
  const { lang, setLang } = useContext(LangContext);
  return { lang, setLang, languages: LANGS };
}
