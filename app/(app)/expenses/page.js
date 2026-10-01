"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import CategoryChip, { categoryColor } from "@/components/CategoryChip";
import AddExpenseModal from "@/components/AddExpenseModal";
import FixedExpenseModal from "@/components/FixedExpenseModal";
import MiniBarChart from "@/components/MiniBarChart";
import { rupee } from "@/lib/format";
import ModuleGuard from "@/components/ModuleGuard";

export default function ExpensesPage() {
  return (
    <ModuleGuard module="expenses">
      <ExpensesPageInner />
    </ModuleGuard>
  );
}

const ordinal = (n) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

function ExpensesPageInner() {
  const { supabase, activeShopId, showToast } = useShop();
  const [tab, setTab] = useState("log"); // 'log' | 'fixed'
  const [expenses, setExpenses] = useState([]);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [fixedModal, setFixedModal] = useState(null); // { editing: row|null } while open

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const [{ data: expData }, { data: fixedData }] = await Promise.all([
      supabase.from("expenses").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }),
      supabase.from("fixed_expenses").select("*").eq("shop_id", activeShopId).order("due_day"),
    ]);
    setExpenses(expData || []);
    setFixedExpenses(fixedData || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const todaysTotal = useMemo(() => {
    const t = new Date().toDateString();
    return expenses.filter((e) => new Date(e.date).toDateString() === t).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const monthTotal = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    return expenses.filter((e) => e.date.slice(0, 7) === monthKey).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const fixedTotal = useMemo(() => fixedExpenses.reduce((s, e) => s + Number(e.amount), 0), [fixedExpenses]);

  const monthCategoryBreakdown = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const map = new Map();
    expenses.filter((e) => e.date.slice(0, 7) === monthKey).forEach((e) => {
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const last6Months = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const total = expenses.filter((e) => e.date.slice(0, 7) === key).reduce((s, e) => s + e.amount, 0);
      months.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), value: total, isHighlight: i === 0 });
    }
    return months;
  }, [expenses]);

  async function addExpense(entry) {
    const { data, error } = await supabase
      .from("expenses")
      .insert({ ...entry, shop_id: activeShopId })
      .select()
      .single();
    if (error) throw error;
    setExpenses((prev) => [data, ...prev]);
    setShowAdd(false);
    showToast("Expense logged");
  }

  async function saveFixedExpense(fields) {
    if (fixedModal.editing) {
      const { data, error } = await supabase.from("fixed_expenses").update(fields).eq("id", fixedModal.editing.id).select().single();
      if (error) throw error;
      setFixedExpenses((prev) => prev.map((f) => (f.id === data.id ? data : f)).sort((a, b) => a.due_day - b.due_day));
      showToast("Fixed expense updated");
    } else {
      const { data, error } = await supabase
        .from("fixed_expenses")
        .insert({ ...fields, shop_id: activeShopId })
        .select()
        .single();
      if (error) throw error;
      setFixedExpenses((prev) => [...prev, data].sort((a, b) => a.due_day - b.due_day));
      showToast("Fixed expense added");
    }
    setFixedModal(null);
  }

  async function deleteFixedExpense(id) {
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
    if (error) {
      showToast(error.message, "err");
      return;
    }
    setFixedExpenses((prev) => prev.filter((f) => f.id !== id));
    showToast("Fixed expense removed");
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading expenses…
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="flex gap-1.5 mb-4 bg-[var(--bg-surface-alt)] p-1 rounded-full w-fit">
        {[
          { v: "log", l: "Expense log" },
          { v: "fixed", l: "Fixed monthly costs" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors ${tab === t.v ? "bg-[var(--strong)] text-[var(--on-strong)]" : "text-[var(--text-secondary)]"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "log" ? (
        <>
          <div className="grid grid-cols-2 gap-3.5 mb-4">
            <div className="ks-card p-4">
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">Today&apos;s expenses</div>
              <div className="ks-display text-2xl font-bold mt-0.5" style={{ color: "var(--danger)" }}>
                {rupee(todaysTotal)}
              </div>
            </div>
            <div className="ks-card p-4">
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">This month</div>
              <div className="ks-display text-2xl font-bold mt-0.5">{rupee(monthTotal)}</div>
            </div>
          </div>

          {(monthCategoryBreakdown.length > 0 || last6Months.some((m) => m.value > 0)) && (
            <div className="grid md:grid-cols-2 gap-3.5 mb-4">
              {last6Months.some((m) => m.value > 0) && (
                <div className="ks-card p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold mb-3">Monthly trend</p>
                  <MiniBarChart
                    data={last6Months}
                    color="var(--danger)"
                    formatValue={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                  />
                </div>
              )}
              {monthCategoryBreakdown.length > 0 && (
                <div className="ks-card p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold mb-3">This month by category</p>
                  <div className="space-y-2.5">
                    {monthCategoryBreakdown.map(([cat, total]) => {
                      const c = categoryColor(cat);
                      const pct = Math.round((total / monthCategoryBreakdown[0][1]) * 100);
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="font-semibold" style={{ color: c.text }}>{cat}</span>
                            <span className="ks-mono text-xs text-[var(--text-secondary)]">{rupee(total)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--bg-surface-alt)] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.text }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end mb-3">
            <button onClick={() => setShowAdd(true)} className="ks-btn-primary flex items-center gap-1.5">
              <Plus size={16} /> Log expense
            </button>
          </div>

          <div className="ks-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Note</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                    <td className="px-5 py-3">
                      <CategoryChip category={e.category} />
                    </td>
                    <td className="px-5 py-3">{e.note || "—"}</td>
                    <td className="px-5 py-3 ks-mono font-bold" style={{ color: "var(--danger)" }}>
                      −{rupee(e.amount)}
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">
                      No expenses logged yet — rent, electricity, salaries, etc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="ks-card p-4 mb-4 w-fit">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">Fixed costs, every month</div>
            <div className="ks-display text-2xl font-bold mt-0.5">{rupee(fixedTotal)}</div>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setFixedModal({ editing: null })} className="ks-btn-primary flex items-center gap-1.5">
              <Plus size={16} /> Add fixed expense
            </button>
          </div>

          <div className="ks-card overflow-hidden divide-y divide-[var(--border)]">
            {fixedExpenses.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{exp.name}</span>
                    <CategoryChip category={exp.category} />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Due on the {exp.due_day}
                    {ordinal(exp.due_day)} of each month
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="ks-mono font-bold">{rupee(exp.amount)}</span>
                  <button
                    onClick={() => setFixedModal({ editing: exp })}
                    className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]"
                    aria-label="Edit expense"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteFixedExpense(exp.id)}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                    aria-label="Remove expense"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {fixedExpenses.length === 0 && (
              <p className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">
                No fixed costs set up yet — rent, salaries, subscriptions, loan EMIs.
              </p>
            )}
          </div>
        </>
      )}

      {showAdd && <AddExpenseModal onClose={() => setShowAdd(false)} onAdd={addExpense} />}
      {fixedModal && <FixedExpenseModal editing={fixedModal.editing} onClose={() => setFixedModal(null)} onSave={saveFixedExpense} />}
    </div>
  );
}
