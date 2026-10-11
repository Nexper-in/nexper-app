"use client";

import { Plus, MessageCircle, ChevronRight } from "lucide-react";
import { rupee } from "@/lib/format";
import RemindersDue from "@/components/RemindersDue";
import { useT } from "@/lib/i18n";

// Phone and tablet view: the total and one card per customer, with the two
// things you do for each (take a payment, send a reminder) under your thumb.
export default function CreditMobile({ vm }) {
  const t = useT();
  const { customers, totalOutstanding, setShowNew, setPayFor, setLedgerCustomer } = vm;
  return (
    <div className="pt-4">
      <div className="ks-card p-4 mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-[var(--text-secondary)] font-semibold">{t("Total outstanding udhaar")}</div>
          <div className="ks-display text-3xl font-bold" style={{ color: "var(--udhaar)" }}>
            {rupee(totalOutstanding)}
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="ks-btn-primary flex items-center gap-1.5 shrink-0 py-2.5">
          <Plus size={16} /> {t("New credit entry")}
        </button>
      </div>

      <RemindersDue vm={vm} />

      <div className="ks-card overflow-hidden">
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
                  className="flex-1 text-xs py-2.5 rounded-full font-semibold"
                  style={{ background: "var(--success-soft)", color: "var(--success)" }}
                >
                  {t("Record payment")}
                </button>
                <button
                  onClick={() => vm.remind(c)}
                  className="flex-1 text-xs py-2.5 rounded-full font-semibold flex items-center justify-center gap-1 text-white"
                  style={{ background: "#25D366" }}
                >
                  <MessageCircle size={13} /> {t("Remind")}
                </button>
              </div>
            )}
          </div>
        ))}
        {customers.length === 0 && (
          <p className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">
            {t("No udhaar entries yet — bill on credit or add one manually.")}
          </p>
        )}
      </div>
    </div>
  );
}
