"use client";

import { Plus, Pencil, FileText, HandCoins } from "lucide-react";
import { rupee } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { parseISO } from "@/lib/supplies";

const shortDate = (iso) => parseISO(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

// What each department owes, with a statement and a payment button. Departments
// pay on their own schedule (daily, weekly, monthly): the balance is always
// "supplied so far minus paid so far".
export default function AccountsTab({ vm, onAddPoint, onEditPoint, onStatement, onPay }) {
  const t = useT();
  const { accounts, totalDue } = vm;
  const shown = accounts.filter((a) => a.active || a.balance !== 0);

  return (
    <div>
      <div className="ks-card p-4 mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-[var(--text-secondary)] font-semibold">{t("Total owed by departments")}</div>
          <div className="ks-display text-3xl font-bold" style={{ color: "var(--udhaar)" }}>{rupee(totalDue)}</div>
        </div>
        <button type="button" onClick={onAddPoint} className="ks-btn-primary flex items-center gap-1.5 shrink-0 py-2.5">
          <Plus size={16} /> {t("Add department")}
        </button>
      </div>

      <div className="ks-card overflow-hidden">
        {shown.map((a) => (
          <div key={a.id} className="p-4 border-b border-[var(--border)] last:border-0" style={{ opacity: a.active ? 1 : 0.6 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">
                  {a.name}
                  {!a.active && <span className="ml-2 text-[10px] uppercase font-bold text-[var(--text-secondary)]">{t("hidden")}</span>}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {a.lastDate ? t("Last supplied {date}", { date: shortDate(a.lastDate) }) : t("Nothing supplied yet")}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="ks-mono font-bold" style={{ color: a.balance > 0 ? "var(--danger)" : "var(--success)" }}>
                  {a.balance > 0 ? rupee(a.balance) : a.balance < 0 ? t("{amount} advance", { amount: rupee(-a.balance) }) : t("All paid")}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onStatement(a)} className="flex-1 text-xs py-2.5 rounded-full font-semibold flex items-center justify-center gap-1 ks-btn-outline !px-2">
                <FileText size={13} /> {t("Statement")}
              </button>
              {a.balance > 0 && (
                <button
                  type="button"
                  onClick={() => onPay(a)}
                  className="flex-1 text-xs py-2.5 rounded-full font-semibold flex items-center justify-center gap-1"
                  style={{ background: "var(--success-soft)", color: "var(--success)" }}
                >
                  <HandCoins size={13} /> {t("Record payment")}
                </button>
              )}
              <button type="button" aria-label={t("Edit department")} onClick={() => onEditPoint(a)} className="ks-btn-outline w-10 h-10 !p-0 flex items-center justify-center shrink-0 self-center">
                <Pencil size={14} />
              </button>
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">{t("No departments yet. Add the first place you supply.")}</p>
        )}
      </div>
    </div>
  );
}
