"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, MessageCircle, Loader2, ChevronRight } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { customerBalance } from "@/lib/dashboardHelpers";
import { whatsappLink, creditReminderText } from "@/lib/messaging";
import NewCreditModal from "@/components/NewCreditModal";
import RecordPaymentModal from "@/components/RecordPaymentModal";
import CustomerLedgerModal from "@/components/CustomerLedgerModal";
import ModuleGuard from "@/components/ModuleGuard";

export default function CreditPage() {
  return (
    <ModuleGuard module="credit">
      <CreditPageInner />
    </ModuleGuard>
  );
}

function CreditPageInner() {
  const { supabase, activeShopId, activeShop, showToast } = useShop();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [ledgerCustomer, setLedgerCustomer] = useState(null);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const { data } = await supabase.from("credits").select("*").eq("shop_id", activeShopId).order("date");
    setCredits(data || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const customers = useMemo(() => {
    const map = new Map();
    credits.forEach((c) => {
      if (!map.has(c.phone)) map.set(c.phone, { phone: c.phone, name: c.name });
    });
    return [...map.values()].map((c) => ({ ...c, balance: customerBalance(credits, c.phone) })).sort((a, b) => b.balance - a.balance);
  }, [credits]);

  const overdue = customers.filter((c) => c.balance > 0);
  const totalOutstanding = overdue.reduce((s, c) => s + c.balance, 0);

  async function addEntry(entry) {
    const { data, error } = await supabase
      .from("credits")
      .insert({ ...entry, shop_id: activeShopId })
      .select()
      .single();
    if (error) throw error;
    setCredits((prev) => [...prev, data]);
    setShowNew(false);
    setPayFor(null);
    showToast(entry.type === "charge" ? "Credit sale recorded" : "Payment recorded");
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading udhaar…
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="ks-card p-5 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">Total outstanding udhaar</div>
          <div className="ks-display text-3xl font-bold" style={{ color: "var(--udhaar)" }}>
            {rupee(totalOutstanding)}
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="ks-btn-primary flex items-center gap-1.5">
          <Plus size={16} /> New credit entry
        </button>
      </div>

      {/* Phones: one card per customer */}
      <div className="ks-only-mobile ks-card overflow-hidden">
        {customers.map((c) => (
          <div key={c.phone} className="p-4 border-b border-[var(--border)] last:border-0">
            <button type="button" onClick={() => setLedgerCustomer(c)} className="w-full flex items-start justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-semibold">
                  {c.name}
                  <ChevronRight size={13} className="text-[var(--text-secondary)] shrink-0" />
                </span>
                <span className="block ks-mono text-xs text-[var(--text-secondary)] mt-0.5">{c.phone}</span>
              </span>
              <span className="ks-mono font-bold shrink-0" style={{ color: c.balance > 0 ? "var(--danger)" : "var(--success)" }}>
                {rupee(c.balance)}
              </span>
            </button>
            {c.balance > 0 && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setPayFor(c)}
                  className="flex-1 text-xs py-2 rounded-full font-semibold"
                  style={{ background: "var(--success-soft)", color: "var(--success)" }}
                >
                  Record payment
                </button>
                <button
                  onClick={() => window.open(whatsappLink(c.phone, creditReminderText(activeShop?.name, c.name, c.balance)), "_blank")}
                  className="flex-1 text-xs py-2 rounded-full font-semibold flex items-center justify-center gap-1 text-white"
                  style={{ background: "#25D366" }}
                >
                  <MessageCircle size={13} /> Remind on WhatsApp
                </button>
              </div>
            )}
          </div>
        ))}
        {customers.length === 0 && (
          <p className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">No udhaar entries yet — bill on credit or add one manually.</p>
        )}
      </div>

      <div className="ks-only-desk ks-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Balance</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr
                key={c.phone}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-alt)] cursor-pointer"
                onClick={() => setLedgerCustomer(c)}
              >
                <td className="px-5 py-3 font-semibold">
                  <div className="flex items-center gap-1.5">
                    {c.name}
                    <ChevronRight size={13} className="text-[var(--text-secondary)]" />
                  </div>
                </td>
                <td className="px-5 py-3 ks-mono text-[var(--text-secondary)]">{c.phone}</td>
                <td className="px-5 py-3 ks-mono font-bold" style={{ color: c.balance > 0 ? "var(--danger)" : "var(--success)" }}>
                  {rupee(c.balance)}
                </td>
                <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1.5">
                    {c.balance > 0 && (
                      <>
                        <button
                          onClick={() => setPayFor(c)}
                          className="text-xs px-2.5 py-1.5 rounded-full font-semibold"
                          style={{ background: "var(--success-soft)", color: "var(--success)" }}
                        >
                          Record payment
                        </button>
                        <button
                          onClick={() => window.open(whatsappLink(c.phone, creditReminderText(activeShop?.name, c.name, c.balance)), "_blank")}
                          className="text-xs px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1 text-white"
                          style={{ background: "#25D366" }}
                        >
                          <MessageCircle size={13} /> Remind
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">
                  No udhaar entries yet — bill on credit or add one manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && <NewCreditModal onClose={() => setShowNew(false)} onAdd={(e) => addEntry({ ...e, type: "charge" })} />}
      {payFor && (
        <RecordPaymentModal
          customer={payFor}
          upiId={activeShop?.upi_id}
          storeName={activeShop?.name}
          onClose={() => setPayFor(null)}
          onAdd={(amount) => addEntry({ phone: payFor.phone, name: payFor.name, amount, type: "payment", note: "Payment received" })}
        />
      )}
      {ledgerCustomer && (
        <CustomerLedgerModal
          customer={ledgerCustomer}
          credits={credits}
          supabase={supabase}
          activeShopId={activeShopId}
          onClose={() => setLedgerCustomer(null)}
          onRecordPayment={(c) => setPayFor(c)}
        />
      )}
    </div>
  );
}
