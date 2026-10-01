"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import Field from "@/components/ui/Field";
import AddDrawModal from "@/components/AddDrawModal";
import { rupee } from "@/lib/format";
import ModuleGuard from "@/components/ModuleGuard";

import { useT } from "@/lib/i18n";
export default function DayClosePage() {
  return (
    <ModuleGuard module="dayclose">
      <DayClosePageInner />
    </ModuleGuard>
  );
}

function DayClosePageInner() {
  const t = useT();
  const { supabase, activeShopId, showToast } = useShop();
  const [bills, setBills] = useState([]);
  const [draws, setDraws] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cashCounted, setCashCounted] = useState("");
  const [showDraw, setShowDraw] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const [{ data: billsData }, { data: drawsData }, { data: reconData }] = await Promise.all([
      supabase.from("bills").select("*").eq("shop_id", activeShopId),
      supabase.from("draws").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }),
      supabase.from("reconciliations").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }),
    ]);
    setBills(billsData || []);
    setDraws(drawsData || []);
    setReconciliations(reconData || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  // Only bills actually paid in physical cash belong in the register —
  // UPI/card/bank collections are non-credit too, but that money never
  // touches the drawer, so counting it here would overstate expected cash.
  const todaysNonCreditBills = useMemo(() => {
    const today = new Date().toDateString();
    return bills.filter((b) => new Date(b.date).toDateString() === today && b.payment_type !== "credit");
  }, [bills]);
  const todaysCashSales = useMemo(
    () => todaysNonCreditBills.filter((b) => (b.payment_method || "cash") === "cash").reduce((s, b) => s + b.total, 0),
    [todaysNonCreditBills]
  );
  const todaysDigitalSales = useMemo(
    () => todaysNonCreditBills.filter((b) => (b.payment_method || "cash") !== "cash").reduce((s, b) => s + b.total, 0),
    [todaysNonCreditBills]
  );

  const todaysDrawList = useMemo(() => {
    const today = new Date().toDateString();
    return draws.filter((d) => new Date(d.date).toDateString() === today);
  }, [draws]);
  const todaysDraws = todaysDrawList.reduce((s, d) => s + d.amount, 0);

  // The counted cash from the most recent PRIOR close carries forward as
  // today's starting float — reconciliations is already ordered newest
  // first, so this is just "the newest one that isn't today's own."
  const openingFloat = useMemo(() => {
    const today = new Date().toDateString();
    const past = reconciliations.filter((r) => new Date(r.date).toDateString() !== today);
    return past.length > 0 ? Number(past[0].cash_counted) : 0;
  }, [reconciliations]);

  const expectedCash = openingFloat + todaysCashSales - todaysDraws;
  const diff = cashCounted !== "" ? Number(cashCounted) - expectedCash : null;

  async function saveClose() {
    if (cashCounted === "") return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("reconciliations")
        .insert({
          shop_id: activeShopId,
          expected_cash: expectedCash,
          cash_counted: Number(cashCounted),
          diff: Number(cashCounted) - expectedCash,
        })
        .select()
        .single();
      if (error) throw error;
      setReconciliations((prev) => [data, ...prev]);
      setCashCounted("");
      showToast(t("Day close saved"));
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setSaving(false);
    }
  }

  async function addDraw(amount, note) {
    const { data, error } = await supabase.from("draws").insert({ shop_id: activeShopId, amount, note }).select().single();
    if (error) throw error;
    setDraws((prev) => [data, ...prev]);
    setShowDraw(false);
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading day close…")}
      </div>
    );
  }

  return (
    <div className="pt-6 grid md:grid-cols-2 gap-5">
      <div className="space-y-4">
        <div className="ks-card p-5">
          <h2 className="ks-display font-bold mb-4">{t("Today's cash reconciliation")}</h2>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-[var(--text-secondary)] font-medium">{t("Opening float (from last close)")}</span>
            <span className="ks-mono font-bold">{rupee(openingFloat)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-[var(--text-secondary)] font-medium">{t("Cash sales today (app)")}</span>
            <span className="ks-mono font-bold">{rupee(todaysCashSales)}</span>
          </div>
          {todaysDigitalSales > 0 && (
            <div className="flex items-center justify-between text-xs mb-2">
              <span style={{ color: "var(--text-secondary)" }}>{t("Digital sales today (UPI/Card/Bank — not in drawer)")}</span>
              <span className="ks-mono">{rupee(todaysDigitalSales)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-[var(--text-secondary)] font-medium">{t("Less: personal draws")}</span>
            <span className="ks-mono font-bold" style={{ color: "var(--danger)" }}>
              −{rupee(todaysDraws)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mb-3 pt-2 border-t border-[var(--border)]">
            <span className="font-semibold">{t("Expected cash in register")}</span>
            <span className="ks-mono font-bold">{rupee(expectedCash)}</span>
          </div>
          <Field label={t("Cash actually counted in register (₹)")}>
            <input
              type="number"
              autoFocus
              className="ks-input text-lg font-semibold ks-mono"
              value={cashCounted}
              onChange={(e) => setCashCounted(e.target.value)}
            />
          </Field>
          {diff !== null && (
            <div className="mt-3 rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: diff === 0 ? "var(--success-soft)" : "var(--danger-soft)" }}>
              <span className="text-xs font-semibold" style={{ color: diff === 0 ? "var(--accent-soft-text)" : "var(--danger)" }}>
                {diff === 0 ? "Matches perfectly ✓" : diff > 0 ? "Extra cash in register" : "Cash short"}
              </span>
              <span className="ks-mono font-bold" style={{ color: diff === 0 ? "var(--accent-soft-text)" : "var(--danger)" }}>
                {diff > 0 ? "+" : ""}
                {rupee(diff)}
              </span>
            </div>
          )}
          <button disabled={cashCounted === "" || saving} onClick={saveClose} className="ks-btn-primary w-full mt-4 flex items-center justify-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t("Save today's close")}
          </button>
        </div>

        <div className="ks-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ks-display font-bold">{t("Personal draws today")}</h2>
            <button
              onClick={() => setShowDraw(true)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-full flex items-center gap-1"
              style={{ background: "var(--bg-surface-alt)", color: "var(--text-primary)" }}
            >
              <Plus size={13} /> {t("Add draw")}
            </button>
          </div>
          <div className="space-y-2">
            {todaysDrawList.length === 0 && <p className="text-sm text-[var(--text-secondary)]">{t("No money taken out for personal use today.")}</p>}
            {todaysDrawList.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">{d.note || "Personal draw"}</span>
                <span className="ks-mono font-semibold" style={{ color: "var(--danger)" }}>
                  −{rupee(d.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ks-card overflow-hidden h-fit">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="ks-display font-bold">{t("Past reconciliations")}</h2>
        </div>
        <div className="p-5 space-y-3 max-h-96 overflow-y-auto ks-scroll">
          {reconciliations.length === 0 && <p className="text-sm text-[var(--text-secondary)]">{t("No closes saved yet.")}</p>}
          {reconciliations.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</div>
                <div className="text-xs text-[var(--text-secondary)] ks-mono">
                  {t("Expected {expected} · Cash {cash}", { expected: rupee(r.expected_cash), cash: rupee(r.cash_counted) })}
                </div>
              </div>
              <span className="ks-mono font-bold" style={{ color: r.diff === 0 ? "var(--accent-soft-text)" : "var(--danger)" }}>
                {r.diff > 0 ? "+" : ""}
                {rupee(r.diff)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {showDraw && <AddDrawModal onClose={() => setShowDraw(false)} onAdd={addDraw} />}
    </div>
  );
}
