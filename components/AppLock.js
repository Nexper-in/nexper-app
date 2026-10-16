"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Loader2, Fingerprint } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { useT } from "@/lib/i18n";
import { clearLocalData } from "@/lib/clearLocalData";
import { getLockConfig, markActive, shouldLock, unlock } from "@/lib/appLock";

// Covers the whole app until the fingerprint / Face ID check passes, when the
// person turned the app lock on. The app underneath stays running (so a bill in
// progress is not lost) but cannot be seen or reached while locked.
export default function AppLock({ children }) {
  const { supabase, user } = useShop();
  const t = useT();
  const [cfg, setCfg] = useState(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const cfgRef = useRef(null);
  const askedRef = useRef(false);

  const load = useCallback(() => {
    if (!user) return;
    const next = getLockConfig(user.id);
    cfgRef.current = next;
    setCfg(next);
    if (!next) setLocked(false);
  }, [user]);

  // Read the setting, and lock at start-up if it is on.
  useEffect(() => {
    if (!user) return;
    load();
    if (shouldLock(cfgRef.current)) setLocked(true);
    window.addEventListener("nexper:applock-changed", load);
    return () => window.removeEventListener("nexper:applock-changed", load);
  }, [user, load]);

  // Lock again after being away; note when the app is in use so a quick reload
  // does not ask again.
  useEffect(() => {
    if (!cfg) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") markActive();
      else if (shouldLock(cfgRef.current)) setLocked(true);
    };
    const tick = setInterval(() => document.visibilityState === "visible" && !locked && markActive(), 15000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", markActive);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", markActive);
    };
  }, [cfg, locked]);

  const tryUnlock = useCallback(async () => {
    if (!cfgRef.current || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await unlock(cfgRef.current);
    setBusy(false);
    if (ok) setLocked(false);
    else setFailed(true);
  }, [busy]);

  // Ask straight away when it locks (some phones need a tap first; the button is there).
  useEffect(() => {
    if (locked && !askedRef.current && document.visibilityState === "visible") {
      askedRef.current = true;
      tryUnlock();
    }
    if (!locked) askedRef.current = false;
  }, [locked, tryUnlock]);

  async function signOut() {
    await supabase.auth.signOut();
    await clearLocalData();
    window.location.href = "/login";
  }

  return (
    <>
      <div inert={locked} aria-hidden={locked || undefined}>
        {children}
      </div>
      {locked && (
        <div role="dialog" aria-modal="true" aria-label={t("Nexper is locked")} className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6 text-center" style={{ background: "var(--bg-page)" }}>
          <p className="ks-wordmark text-[40px] mb-6">
            Ne<span className="ks-grad-text">x</span>per
          </p>
          <span className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}>
            <Lock size={24} />
          </span>
          <h1 className="ks-display font-bold text-lg">{t("Nexper is locked")}</h1>
          <p className="text-sm mt-1 mb-5" style={{ color: "var(--text-secondary)" }}>
            {failed ? t("That didn't work. Try again.") : t("Use your fingerprint, face or screen lock to open it.")}
          </p>
          <button type="button" onClick={tryUnlock} disabled={busy} className="ks-btn-primary flex items-center gap-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={18} />}
            {t("Unlock")}
          </button>
          <button type="button" onClick={signOut} className="mt-5 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            {t("Sign out instead")}
          </button>
        </div>
      )}
    </>
  );
}
