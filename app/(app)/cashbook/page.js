"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { fetchShopItems } from "@/lib/products";
import ModuleGuard from "@/components/ModuleGuard";

export default function CashbookPage() {
  return (
    <ModuleGuard module="cashbook">
      <CashbookPageInner />
    </ModuleGuard>
  );
}

function CashbookPageInner() {
  const { supabase, activeShopId } = useShop();
  const [bills, setBills] = useState([]);
  const [draws, setDraws] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [credits, setCredits] = useState([]);
  const [movements, setMovements] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30"); // days

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const [{ data: billsData }, { data: drawsData }, { data: expensesData }, { data: creditsData }, { data: movesData }, itemsData] =
      await Promise.all([
        supabase.from("bills").select("*").eq("shop_id", activeShopId),
        supabase.from("draws").select("*").eq("shop_id", activeShopId),
        supabase.from("expenses").select("*").eq("shop_id", activeShopId),
        supabase.from("credits").select("*").eq("shop_id", activeShopId),
        supabase.from("movements").select("*").eq("shop_id", activeShopId),
        fetchShopItems(supabase, activeShopId, { orderByCode: false }),
      ]);
    setBills(billsData || []);
    setDraws(drawsData || []);
    setExpenses(expensesData || []);
    setCredits(creditsData || []);
    setMovements(movesData || []);
    setItems(itemsData);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const entries = useMemo(() => {
    const rows = [];
    bills.forEach((b) => {
      if (b.payment_type !== "credit") rows.push({ id: b.id, date: b.date, type: "in", label: `Sale — ${b.bill_no}`, amount: b.total });
    });
    credits
      .filter((c) => c.type === "payment")
      .forEach((c) => {
        rows.push({ id: c.id, date: c.date, type: "in", label: `Udhaar payment — ${c.name}`, amount: c.amount });
      });
    draws.forEach((d) => {
      rows.push({ id: d.id, date: d.date, type: "out", label: d.note || "Personal draw", amount: d.amount });
    });
    expenses.forEach((e) => {
      rows.push({ id: e.id, date: e.date, type: "out", label: `${e.category}${e.note ? " — " + e.note : ""}`, amount: e.amount });
    });
    movements
      .filter((m) => m.type === "in" && m.reason === "Purchase")
      .forEach((m) => {
        const item = items.find((i) => i.name === m.item_name);
        const cost = item ? (item.cost_price ?? item.price) * m.qty : 0;
        if (cost > 0) {
          rows.push({
            id: m.id,
            date: m.date,
            type: "out",
            label: `Stock purchase — ${m.item_name}${m.supplier ? " (" + m.supplier + ")" : ""}`,
            amount: cost,
          });
        }
      });
    return rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [bills, draws, expenses, credits, movements, items]);

  // Balance is a true running total computed over ALL history, not just
  // the entries inside the selected date range — otherwise switching
  // "7 days" → "30 days" changes where the running total starts from
  // and every balance shown is wrong. The 7/30/90-day range only
  // controls which rows are *displayed* and what the Cash in/out/Net
  // summary cards total, same as before.
  let running = 0;
  const entriesWithBalance = entries.map((e) => {
    running += e.type === "in" ? e.amount : -e.amount;
    return { ...e, balance: running };
  });

  const cutoff = Date.now() - Number(range) * 24 * 60 * 60 * 1000;
  const withBalance = entriesWithBalance.filter((e) => new Date(e.date).getTime() >= cutoff);
  const totalIn = withBalance.filter((e) => e.type === "in").reduce((s, e) => s + e.amount, 0);
  const totalOut = withBalance.filter((e) => e.type === "out").reduce((s, e) => s + e.amount, 0);

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading cashbook…
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="ks-card p-4">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">Cash in</div>
            <div className="ks-display text-xl font-bold mt-0.5" style={{ color: "var(--accent-soft-text)" }}>
              {rupee(totalIn)}
            </div>
          </div>
          <div className="ks-card p-4">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">Cash out</div>
            <div className="ks-display text-xl font-bold mt-0.5" style={{ color: "var(--danger)" }}>
              {rupee(totalOut)}
            </div>
          </div>
          <div className="ks-card p-4">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">Net</div>
            <div className="ks-display text-xl font-bold mt-0.5">{rupee(totalIn - totalOut)}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3 bg-[var(--bg-surface-alt)] p-1 rounded-full w-fit">
        {[
          { v: "7", l: "7 days" },
          { v: "30", l: "30 days" },
          { v: "90", l: "90 days" },
        ].map((r) => (
          <button
            key={r.v}
            onClick={() => setRange(r.v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${range === r.v ? "bg-[var(--strong)] text-[var(--on-strong)]" : "text-[var(--text-secondary)]"}`}
          >
            {r.l}
          </button>
        ))}
      </div>

      <div className="ks-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Entry</th>
              <th className="px-5 py-3 font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {[...withBalance].reverse().map((e) => (
              <tr key={e.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-5 py-3 text-[var(--text-secondary)]">{new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                <td className="px-5 py-3">{e.label}</td>
                <td className="px-5 py-3 ks-mono font-semibold" style={{ color: e.type === "in" ? "var(--accent-soft-text)" : "var(--danger)" }}>
                  {e.type === "in" ? "+" : "−"}
                  {rupee(e.amount)}
                </td>
                <td className="px-5 py-3 ks-mono font-bold">{rupee(e.balance)}</td>
              </tr>
            ))}
            {withBalance.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">
                  Nothing in this period yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
