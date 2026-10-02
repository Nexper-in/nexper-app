"use client";

import { Minus, Plus, ChevronLeft, ChevronRight, Copy, Loader2, Check } from "lucide-react";
import { rupee } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { addDays, cellKey, lineAmount, parseISO } from "@/lib/supplies";

function dayLabel(iso, today, t) {
  if (iso === today) return t("Today");
  if (iso === addDays(today, -1)) return t("Yesterday");
  return parseISO(iso).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

// The day's round: for each department, how many of each item went there.
// Meant to be filled in after the round, from the helper's notes.
export default function RoundTab({ vm, onAddPoint }) {
  const t = useT();
  const { today, date, changeDate, activePoints, items, edited, totals, dirty, setQty, bump, saving, save, copyPrevious, loadingDay } = vm;

  if (!items.length) {
    return (
      <div className="ks-card p-5 text-sm text-[var(--text-secondary)]">
        {t("No items to supply yet. Add tea, biscuits and so on in Stock first. Items marked quick are the ones shown here.")}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 max-w-md">
        <button type="button" aria-label={t("Previous day")} onClick={() => changeDate(addDays(date, -1))} className="ks-btn-outline w-11 h-11 !p-0 flex items-center justify-center">
          <ChevronLeft size={18} />
        </button>
        <label className="flex-1 min-w-0 relative">
          <span className="ks-card block text-center font-semibold py-2.5">{dayLabel(date, today, t)}</span>
          <input
            type="date"
            aria-label={t("Date")}
            max={today}
            value={date}
            onChange={(e) => e.target.value && changeDate(e.target.value > today ? today : e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </label>
        <button
          type="button"
          aria-label={t("Next day")}
          disabled={date >= today}
          onClick={() => changeDate(addDays(date, 1))}
          className="ks-btn-outline w-11 h-11 !p-0 flex items-center justify-center disabled:opacity-40"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={copyPrevious} className="ks-btn-outline text-xs !py-2 flex items-center gap-1.5">
          <Copy size={13} /> {t("Copy the day before")}
        </button>
        <button type="button" onClick={onAddPoint} className="ks-btn-outline text-xs !py-2 flex items-center gap-1.5">
          <Plus size={13} /> {t("Add department")}
        </button>
        {loadingDay && <Loader2 size={14} className="animate-spin text-[var(--text-secondary)]" />}
      </div>

      {activePoints.length === 0 ? (
        <div className="ks-card p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-3">{t("No departments yet. Add the first place you supply.")}</p>
          <button type="button" onClick={onAddPoint} className="ks-btn-primary inline-flex items-center gap-1.5">
            <Plus size={16} /> {t("Add department")}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {activePoints.map((p) => {
            const pointAmount = items.reduce((s, it) => s + lineAmount(edited[cellKey(p.id, it.id)] || 0, it.price), 0);
            return (
              <div key={p.id} className="ks-card p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-semibold truncate">{p.name}</h3>
                  <span className="ks-mono text-sm font-bold shrink-0" style={{ color: pointAmount ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {rupee(pointAmount)}
                  </span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {items.map((it) => {
                    const q = edited[cellKey(p.id, it.id)] || 0;
                    return (
                      <div key={it.id} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <div className="text-sm truncate">{it.name}</div>
                          <div className="ks-mono text-[11px] text-[var(--text-secondary)]">{rupee(it.price)}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" aria-label={t("One less")} disabled={!q} onClick={() => bump(p.id, it.id, -1)} className="ks-btn-outline w-11 h-11 !p-0 flex items-center justify-center disabled:opacity-35">
                            <Minus size={16} />
                          </button>
                          <input
                            inputMode="numeric"
                            aria-label={`${p.name} ${it.name}`}
                            value={q || ""}
                            placeholder="0"
                            onChange={(e) => setQty(p.id, it.id, e.target.value.replace(/\D/g, ""))}
                            onFocus={(e) => e.target.select()}
                            className="ks-input ks-mono !w-14 text-center !px-1 font-bold"
                          />
                          <button type="button" aria-label={t("One more")} onClick={() => bump(p.id, it.id, 1)} className="ks-btn-outline w-11 h-11 !p-0 flex items-center justify-center">
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phones: totals and Save stay in reach above the tab bar. */}
      <div className="h-16 lg:hidden" />
      <div
        className="ks-no-print ks-card fixed left-3 right-3 z-20 lg:static lg:mt-4 flex items-center justify-between gap-3 px-4 py-2.5"
        style={{ bottom: "calc(74px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 12px 30px rgba(0,0,0,0.35)" }}
      >
        <div className="min-w-0">
          <p className="text-[11px] text-[var(--text-secondary)] truncate">
            {totals.lines.length ? totals.lines.map((l) => `${l.name} ${l.qty}`).join(" · ") : t("Nothing entered yet")}
          </p>
          <p className="ks-mono text-lg font-extrabold leading-tight">{rupee(totals.amount)}</p>
        </div>
        <button type="button" onClick={save} disabled={!dirty || saving} className="ks-btn-primary flex items-center gap-1.5 shrink-0">
          {saving ? <Loader2 size={16} className="animate-spin" /> : !dirty && totals.qty > 0 ? <Check size={16} /> : null}
          {!dirty && totals.qty > 0 ? t("Saved") : t("Save")}
        </button>
      </div>
    </div>
  );
}
