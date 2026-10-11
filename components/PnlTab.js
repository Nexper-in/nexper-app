"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { useT } from "@/lib/i18n";
import { rupee } from "@/lib/format";
import { fetchShopItems } from "@/lib/products";
import { monthlyPnL } from "@/lib/profitLoss";

function Row({ label, value, bold, minus, sub }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${bold ? "font-bold" : ""}`}>
      <span className={sub ? "pl-4 text-xs text-[var(--text-secondary)]" : "text-sm"}>{label}</span>
      <span className="ks-mono tabular-nums text-sm" style={sub ? { color: "var(--text-secondary)" } : undefined}>
        {minus ? "− " : ""}{rupee(value)}
      </span>
    </div>
  );
}

// One monthly number: what the shop really kept after cost of goods,
// running costs and fixed costs.
export default function PnlTab({ month, monthLabel }) {
  const t = useT();
  const { supabase, activeShopId } = useShop();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeShopId) return;
    let live = true;
    setLoading(true);
    const start = new Date(`${month}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    Promise.all([
      supabase.from("bills").select("items, total, subtotal").eq("shop_id", activeShopId).gte("date", start.toISOString()).lt("date", end.toISOString()),
      supabase.from("sale_returns").select("items, refund_amount").eq("shop_id", activeShopId).gte("date", start.toISOString()).lt("date", end.toISOString()),
      fetchShopItems(supabase, activeShopId),
      supabase.from("expenses").select("category, amount").eq("shop_id", activeShopId).gte("date", ymd(start)).lt("date", ymd(end)),
      supabase.from("fixed_expenses").select("name, category, amount").eq("shop_id", activeShopId),
    ]).then(([b, r, items, e, f]) => {
      if (!live) return;
      setData(monthlyPnL({ bills: b.data || [], returns: r.data || [], items, expenses: e.data || [], fixed: f.data || [] }));
      setLoading(false);
    });
    return () => { live = false; };
  }, [supabase, activeShopId, month]);

  const p = data;
  const good = p && p.profit >= 0;
  const notes = useMemo(() => {
    if (!p) return [];
    const n = [];
    if (p.notes.noCostLines > 0) n.push(t("{n} sold items have no purchase price, so their cost is not counted. Add purchase prices in Stock for a true profit.", { n: p.notes.noCostLines }));
    if (p.notes.skippedSupplier > 0) n.push(t("Supplier payments of {amount} are not counted again, because that stock is already in cost of goods sold.", { amount: rupee(p.notes.skippedSupplier) }));
    if (p.notes.skippedFixedDup > 0) n.push(t("{amount} of logged expenses match your fixed monthly costs, so only the fixed cost is counted.", { amount: rupee(p.notes.skippedFixedDup) }));
    return n;
  }, [p, t]);

  if (loading || !p) {
    return <div className="pt-6 flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> {t("Loading {month} data…", { month: monthLabel })}</div>;
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="ks-card p-5">
        <p className="ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">{t("Profit in {month}", { month: monthLabel })}</p>
        <p className="ks-display font-bold text-3xl mt-1" style={{ color: good ? "var(--ok, #16a34a)" : "var(--danger)" }}>{rupee(p.profit)}</p>
        {p.marginPct != null && <p className="text-xs mt-1 text-[var(--text-secondary)]">{t("{pct}% of net sales", { pct: p.marginPct })}</p>}
      </div>

      <div className="ks-card p-5 divide-y" style={{ borderColor: "var(--border)" }}>
        <Row label={t("Sales (incl. GST)")} value={p.sales} />
        {p.refunds > 0 && <Row label={t("Returns refunded")} value={p.refunds} minus />}
        <Row label={t("GST collected (not your income)")} value={p.gst} minus />
        <Row label={t("Net sales")} value={p.netSales} bold />
        <Row label={t("Cost of goods sold")} value={p.cogs} minus />
        <Row label={t("Gross profit")} value={p.grossProfit} bold />
        <Row label={t("Running costs")} value={p.running} minus />
        {p.runningByCategory.map((c) => <Row key={c.category} sub label={c.category} value={c.amount} />)}
        <Row label={t("Fixed monthly costs")} value={p.fixed} minus />
        {p.fixedList.map((f) => <Row key={f.name} sub label={f.name} value={f.amount} />)}
        <Row label={t("Profit")} value={p.profit} bold />
      </div>

      {notes.length > 0 && (
        <ul className="text-xs text-[var(--text-secondary)] space-y-1.5 list-disc pl-5">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      <p className="text-xs text-[var(--text-secondary)]">{t("Cost of goods uses each item's current purchase price. This is an estimate, not an audited account.")}</p>
    </div>
  );
}
