"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";

// Language switch. "menu" is the compact header-style dropdown (sign-in
// page); "grid" is the list of all six used inside the account menu.
export default function LanguagePicker({ variant = "menu" }) {
  const { lang, setLang, languages } = useLang();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = languages.find((l) => l.code === lang) || languages[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t("Language")}>
        {languages.map((l) => (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={l.code === lang}
            lang={l.htmlLang}
            onClick={() => setLang(l.code)}
            className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            style={
              l.code === lang
                ? { background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)", boxShadow: "inset 0 0 0 1.5px var(--accent)" }
                : { background: "var(--bg-surface-alt)", color: "var(--text-primary)" }
            }
          >
            {l.name}
            {l.code === lang && <Check size={14} />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Language")}
        className="flex items-center gap-1.5 rounded-full px-3 h-9 text-sm font-semibold"
        style={{ border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
      >
        <Globe size={15} style={{ color: "var(--text-secondary)" }} />
        {current.name}
        <ChevronDown size={14} style={{ color: "var(--text-secondary)" }} />
      </button>
      {open && (
        <ul role="menu" className="ks-card absolute right-0 top-[calc(100%+8px)] z-50 w-56 p-1.5 ks-fade-up" style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
          {languages.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={l.code === lang}
                lang={l.htmlLang}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-left hover:bg-[var(--bg-surface-alt)]"
              >
                {l.name}
                {l.code !== "en" && <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{l.english}</span>}
                {l.code === lang && <Check size={14} className="ml-auto" style={{ color: "var(--accent-soft-text)" }} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
