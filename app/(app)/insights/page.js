"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, TrendingDown, AlertTriangle, PackageX, Tag } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import ModuleGuard from "@/components/ModuleGuard";
import { fetchShopItems } from "@/lib/products";
import { marginAlerts, deadStock } from "@/lib/stockHealth";
import { rupee } from "@/lib/format";
import { T, useT } from "@/lib/i18n";

const KIND_LABEL = { loss: T("Selling below cost"), costUp: T("Cost went up"), thin: T("Thin margin") };
const KIND_STYLE = {
  loss: { background: "var(--danger-soft)", color: "var(--danger)" },
  costUp: { background: "var(--warn-soft)", color: "var(--warn)" },
  thin: { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" },
};

export default function InsightsPage() {
  return (
    <ModuleGuard module="inventory">
      <InsightsInner />
    </ModuleGuard>
  );
}

function InsightsInner() {
  const t = useT();
  const { supabase, activeShopId, isOwner, showToast } = useShop();
  const [tab, setTab] = useState("margin");
  const [days, setDays] = useState(30);
  const [items, setItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
    const [itemRows, { data: batchRows }, { data: billRows }] = await Promise.all([
      fetchShopItems(supabase, activeShopId, { orderByCode: false }),
      supabase.from("stock_batches").select("shop_product_id, cost_price, received_date, reason").eq("shop_id", activeShopId).order("received_date", { ascending: false }).limit(5000),
      supabase.from("bills").select("items, date").eq("shop_id", activeShopId).gte("date", since),
    ]);
    setItems(itemRows);
    setBatches(batchRows || []);
    setBills(billRows || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const alerts = useMemo(() => marginAlerts(items, batches), [items, batches]);
  const dead = useMemo(() => deadStock(items, bills, { days }), [items, bills, days]);
  const deadValue = dead.reduce((s, d) => s + d.value, 0);
  const missingCost = items.filter((i) => i.cost_price == null).length;

  async function applyPrice(a) {
    setBusy(a.id);
    const { error } = await supabase.from("shop_products").update({ price: a.fix.price }).eq("id", a.id);
    setBusy(null);
    if (error) return showToast(error.message, "err");
    setItems((prev) => prev.map((i) => (i.id === a.id ? { ...i, price: a.fix.price } : i)));
    showToast(t("{name}: price set to {price}", { name: a.name, price: rupee(a.fix.price) }));
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading…")}
      </div>
    );
  }

  const tabBtn = (id, label, Icon, count) => (
    <button
      onClick={() => setTab(id)}
      className="px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors"
      style={tab === id ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
    >
      <Icon size={14} /> {label}
      {count > 0 && <span className="ks-mono opacity-80">({count})</span>}
    </button>
  );

  return (
    <div className="pt-6 max-w-3xl">
      <div className="hidden lg:block mb-4">
        <h1 className="ks-display font-bold text-xl">{t("Stock insights")}</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{t("Items that lose you money, and stock that is not selling.")}</p>
      </div>

      <div className="inline-flex p-1 rounded-full mb-5" style={{ background: "var(--bg-surface-alt)" }}>
        {tabBtn("margin", t("Margin alerts"), TrendingDown, alerts.length)}
        {tabBtn("dead", t("Dead stock"), PackageX, dead.length)}
      </div>

      {tab === "margin" ? (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="ks-card p-5 text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("No margin problems found. Every item with a purchase price earns at least 10%.")}
            </div>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="ks-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{a.name}</div>
                    <div className="text-xs ks-mono mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {t("Sells {price} · cost {cost} · margin {m}%", { price: rupee(a.price), cost: rupee(a.cost), m: a.marginPct })}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={KIND_STYLE[a.kind]}>{t(KIND_LABEL[a.kind])}</span>
                </div>
                {a.costUp && (
                  <p className="text-xs mt-2" style={{ color: "var(--warn)" }}>
                    {t("Last purchase cost {now} against {before} before (up {pct}%).", { now: rupee(a.costUp.newCost), before: rupee(a.costUp.oldCost), pct: a.costUp.risePct })}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button
                    onClick={() => applyPrice(a)}
                    disabled={busy === a.id || a.fix.price === a.price}
                    className="ks-btn-primary text-xs !py-2 !px-3.5 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {busy === a.id && <Loader2 size={13} className="animate-spin" />}
                    {t("Set price to {price}", { price: rupee(a.fix.price) })}
                  </button>
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {a.fix.cappedAtMrp ? t("Held at MRP. A higher price is not allowed.") : t("Gives about 15% margin")}
                  </span>
                </div>
              </div>
            ))
          )}
          {missingCost > 0 && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {t("{n} items have no purchase price yet, so they cannot be checked. Add it from Stock, Edit price.", { n: missingCost })}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="ks-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>{t("Money sitting in slow stock")}</div>
              <div className="ks-display text-2xl font-bold" style={{ color: "var(--udhaar)" }}>{rupee(deadValue)}</div>
            </div>
            <label className="text-xs flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
              {t("Not sold for")}
              <select className="ks-input !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[15, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>{t("{n} days", { n: d })}</option>
                ))}
              </select>
            </label>
          </div>
          {isOwner && dead.length > 0 && (
            <Link href="/clearance" className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-full" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}>
              <Tag size={13} /> {t("Make a clearance offer for these")}
            </Link>
          )}
          {dead.length === 0 ? (
            <div className="ks-card p-5 text-sm" style={{ color: "var(--text-secondary)" }}>{t("Nothing is stuck. Every item in stock has sold in the last {n} days.", { n: days })}</div>
          ) : (
            <div className="ks-card overflow-hidden">
              {dead.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{d.name}</div>
                    <div className="text-xs ks-mono" style={{ color: "var(--text-secondary)" }}>
                      {d.neverSold ? t("Never sold") : t("Last sold {n} days ago", { n: d.daysIdle })} · {d.stock} {d.unit}
                    </div>
                  </div>
                  <div className="ks-mono font-bold text-sm shrink-0">{rupee(d.value)}</div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{t("Value is what the stock cost you; where no purchase price is saved it uses the selling price.")}</p>
        </div>
      )}
    </div>
  );
}
