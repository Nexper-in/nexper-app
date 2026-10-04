"use client";

import { Plus, MessageCircle, ChevronRight } from "lucide-react";
import { rupee } from "@/lib/format";
import { whatsappLink, creditReminderText } from "@/lib/messaging";
import { useT } from "@/lib/i18n";

// Laptop view: the full table, plus how many customers owe you.
export default function CreditDesktop({ vm }) {
  const t = useT();
  const { activeShop, customers, overdue, totalOutstanding, setShowNew, setPayFor, setLedgerCustomer } = vm;
  return (
    <div className="pt-6">
      <div className="ks-card p-5 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Total outstanding udhaar")}</div>
            <div className="ks-display text-3xl font-bold" style={{ color: "var(--udhaar)" }}>
              {rupee(totalOutstanding)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Customers who owe")}</div>
            <div className="ks-display text-3xl font-bold">{overdue.length}</div>
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="ks-btn-primary flex items-center gap-1.5">
          <Plus size={16} /> {t("New credit entry")}
        </button>
      </div>

      <div className="ks-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium">{t("Customer")}</th>
              <th className="px-5 py-3 font-medium">{t("Phone")}</th>
              <th className="px-5 py-3 font-medium">{t("Balance")}</th>
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
                          {t("Record payment")}
                        </button>
                        <button
                          onClick={() => window.open(whatsappLink(c.phone, creditReminderText(activeShop?.name, c.name, c.balance)), "_blank", "noopener,noreferrer")}
                          className="text-xs px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1 text-white"
                          style={{ background: "#25D366" }}
                        >
                          <MessageCircle size={13} /> {t("Remind")}
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
                  {t("No udhaar entries yet — bill on credit or add one manually.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
