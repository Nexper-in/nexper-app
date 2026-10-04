"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Receipt, ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react";
import { rupee } from "@/lib/format";

import { useT } from "@/lib/i18n";
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function CustomerLedgerModal({ customer, credits, supabase, activeShopId, onClose, onRecordPayment }) {
  const t = useT();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customer?.phone) return;
    setLoading(true);
    const { data } = await supabase
      .from("bills")
      .select("*")
      .eq("shop_id", activeShopId)
      .eq("customer_phone", customer.phone)
      .order("date", { ascending: false });
    setBills(data || []);
    setLoading(false);
  }, [customer?.phone, supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const customerCredits = credits.filter((c) => c.phone === customer.phone).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Merge bills and credits into a single timeline
  const timeline = [
    ...bills.map((b) => ({ ...b, _type: "bill", _date: new Date(b.date) })),
    ...customerCredits.map((c) => ({ ...c, _type: "credit", _date: new Date(c.date) })),
  ].sort((a, b) => b._date - a._date);

  const totalBilled = bills.reduce((s, b) => s + b.total, 0);
  const totalPaid = customerCredits.filter((c) => c.type === "payment").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="ks-card w-full max-w-lg relative flex flex-col" style={{ background: "var(--bg-surface)", maxHeight: "85dvh" }}>
        <div className="flex items-start justify-between p-5 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 className="ks-display font-bold text-lg">{customer.name}</h2>
            <p className="text-sm ks-mono text-[var(--text-secondary)] mt-0.5">{customer.phone}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full ml-3 mt-0.5 shrink-0"
            style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[var(--border)] shrink-0">
          <div className="px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Balance")}</div>
            <div className="ks-mono font-bold text-lg" style={{ color: customer.balance > 0 ? "var(--danger)" : "var(--accent-soft-text)" }}>
              {rupee(customer.balance)}
            </div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Total billed")}</div>
            <div className="ks-mono font-bold text-lg">{rupee(totalBilled)}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Total paid")}</div>
            <div className="ks-mono font-bold text-lg" style={{ color: "var(--accent-soft-text)" }}>{rupee(totalPaid)}</div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 ks-scroll p-5 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 size={14} className="animate-spin" /> {t("Loading transactions…")}
            </div>
          )}
          {!loading && timeline.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)] text-center py-6">{t("No transactions found for this customer.")}</p>
          )}
          {!loading && timeline.map((entry) => {
            if (entry._type === "bill") {
              return (
                <div key={`bill-${entry.id}`} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--bg-surface-alt)" }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--success-soft)" }}>
                    <Receipt size={14} style={{ color: "var(--accent-soft-text)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{entry.bill_no}</span>
                      <span className="ks-mono font-bold text-sm">{rupee(entry.total)}</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{fmtDate(entry.date)}</span>
                      <span>·</span>
                      <span className="capitalize">{entry.payment_type}</span>
                      {entry.items?.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{entry.items.length} item{entry.items.length === 1 ? "" : "s"}</span>
                        </>
                      )}
                    </div>
                    {entry.items?.length > 0 && (
                      <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
                        {entry.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            // credit entry
            const isPayment = entry.type === "payment";
            return (
              <div key={`credit-${entry.id}`} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--bg-surface-alt)" }}>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: isPayment ? "var(--success-soft)" : "var(--danger-soft)" }}
                >
                  {isPayment ? (
                    <ArrowUpCircle size={14} style={{ color: "var(--accent-soft-text)" }} />
                  ) : (
                    <ArrowDownCircle size={14} style={{ color: "var(--danger)" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{isPayment ? "Payment received" : "Credit sale"}</span>
                    <span className="ks-mono font-bold text-sm" style={{ color: isPayment ? "var(--accent-soft-text)" : "var(--danger)" }}>
                      {isPayment ? "−" : "+"}{rupee(entry.amount)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {fmtDate(entry.date)}{entry.note ? ` · ${entry.note}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {customer.balance > 0 && (
          <div className="p-4 border-t border-[var(--border)] shrink-0">
            <button
              onClick={() => { onClose(); onRecordPayment(customer); }}
              className="ks-btn-primary w-full"
            >
              {t("Record payment · {amt} due", { amt: rupee(customer.balance) })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
