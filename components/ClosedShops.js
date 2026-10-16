"use client";

import { useState } from "react";
import { Archive, Download, Loader2, RotateCcw } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { createShopBackup } from "@/lib/exportData";
import { downloadFile } from "@/lib/gstReport";
import { useT } from "@/lib/i18n";

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

// What the owner sees when the shop they opened is closed: nothing to bill, but everything
// can be downloaded and, for 90 days, the shop can be reopened.
export function ClosedShopScreen() {
  const t = useT();
  const { supabase, activeShop, shops, setActiveShopId, reopenShop, showToast } = useShop();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const expired = activeShop?.purge_after && new Date(activeShop.purge_after) <= new Date();

  async function backup() {
    setBusy("backup");
    setError("");
    try {
      const { blob, filename } = await createShopBackup(supabase, activeShop);
      downloadFile(filename, blob, "application/zip");
      showToast(t("Backup downloaded"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function reopen() {
    setBusy("reopen");
    setError("");
    try {
      await reopenShop(activeShop.id);
      showToast(t("{name} is open again", { name: activeShop.name }));
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm ks-card p-6 space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}>
          <Archive size={22} />
        </div>
        <h1 className="ks-display text-xl font-bold">{t("This shop is closed")}</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {expired
            ? t("{name} is waiting to be removed.", { name: activeShop.name })
            : t("{name} was closed on {date}. It is removed for good on {removal}. Until then you can download everything or reopen it.", { name: activeShop.name, date: day(activeShop.closed_at), removal: day(activeShop.purge_after) })}
        </p>
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button onClick={backup} disabled={!!busy} className="ks-btn-outline w-full flex items-center justify-center gap-2">
          {busy === "backup" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t("Download backup")}
        </button>
        {!expired && (
          <button onClick={reopen} disabled={!!busy} className="ks-btn-primary w-full flex items-center justify-center gap-2">
            {busy === "reopen" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} {t("Reopen shop")}
          </button>
        )}
        {shops.length === 0 && (
          <button onClick={() => setActiveShopId(null)} className="text-sm font-semibold" style={{ color: "var(--accent-soft-text)" }}>
            {t("Set up a new shop")}
          </button>
        )}
        {shops.length > 0 && (
          <button onClick={() => setActiveShopId(shops[0].id)} className="text-sm font-semibold" style={{ color: "var(--accent-soft-text)" }}>
            {t("Go to my shops")}
          </button>
        )}
      </div>
    </main>
  );
}

// Closed shops, listed where the owner can find them (Company screen, and the set-up screen
// when no open shop is left).
export function ClosedShopsList({ onOpen }) {
  const t = useT();
  const { closedShops, setActiveShopId } = useShop();
  if (!closedShops.length) return null;
  return (
    <div className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-secondary)" }}>{t("Closed shops")}</p>
      <div className="grid gap-2">
        {closedShops.map((s) => (
          <div key={s.id} className="ks-card p-3 flex items-center gap-3 min-w-0">
            <Archive size={16} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{s.name}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("Removed for good on {date}", { date: day(s.purge_after) })}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveShopId(s.id);
                onOpen?.();
              }}
              className="ks-btn-outline text-xs !py-2 shrink-0"
            >
              {t("View")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
