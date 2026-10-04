"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { callApi } from "@/lib/apiClient";

export const DANGER_BG = "rgba(226,75,74,0.14)";
export const DANGER_TEXT = "#F29C9C";
export const OK_BG = "rgba(34,197,148,0.14)";
export const OK_TEXT = "#7FE0B8";

// Loads every platform setting (defaults filled in) and saves one at a time.
export function useSettings(supabase) {
  const [settings, setSettings] = useState(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const json = await callApi(supabase, "/api/admin/settings", null, "GET");
      setSettings(json.settings);
      setNeedsMigration(Boolean(json.needsMigration));
    } catch (err) {
      setError(err.message);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (key, value) => {
      const json = await callApi(supabase, "/api/admin/settings", { key, value });
      setSettings((s) => ({ ...s, [key]: json.value }));
      return json.value;
    },
    [supabase]
  );

  return { settings, save, reload: load, needsMigration, error };
}

export function MigrationNotice({ show }) {
  if (!show) return null;
  return (
    <p className="text-xs rounded-lg px-3 py-2 mb-4 flex items-start gap-2" style={{ background: DANGER_BG, color: DANGER_TEXT }}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      The console tables aren&apos;t in the database yet. Run <code>029_platform_console.sql</code> (and 024-028) in the Supabase SQL editor. Until then changes can&apos;t be saved.
    </p>
  );
}

export function Page({ title, subtitle, children }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="ks-display font-bold text-xl">{title}</h1>
        {subtitle && (
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, hint, children, action }) {
  return (
    <section className="ks-card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="ks-display font-bold">{title}</h2>
          {hint && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {hint}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ on, onChange, label, hint, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="w-full flex items-center justify-between gap-3 py-2 text-left disabled:opacity-50"
    >
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && (
          <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
            {hint}
          </span>
        )}
      </span>
      <span className="w-10 h-6 rounded-full p-0.5 shrink-0 transition-colors" style={{ background: on ? "var(--accent)" : "var(--bg-surface-alt)", border: "1px solid var(--border)" }}>
        <span className="block w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
      </span>
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

// A save button with its own busy / saved / error state.
export function SaveButton({ onSave, disabled, label = "Save" }) {
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const [msg, setMsg] = useState("");
  async function run() {
    setState("saving");
    setMsg("");
    try {
      await onSave();
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch (err) {
      setMsg(err.message);
      setState("error");
    }
  }
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={run} disabled={disabled || state === "saving"} className="ks-btn-primary flex items-center gap-2 disabled:opacity-40">
        {state === "saving" && <Loader2 size={15} className="animate-spin" />}
        {label}
      </button>
      {state === "saved" && (
        <span className="text-xs flex items-center gap-1" style={{ color: OK_TEXT }}>
          <CheckCircle2 size={14} /> Saved
        </span>
      )}
      {state === "error" && (
        <span className="text-xs" style={{ color: DANGER_TEXT }}>
          {msg}
        </span>
      )}
    </div>
  );
}

export const Loading = () => (
  <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
    <Loader2 size={16} className="animate-spin" /> Loading…
  </div>
);

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
