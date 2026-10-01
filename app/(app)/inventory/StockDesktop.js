"use client";

import { Search, Plus } from "lucide-react";
import CategoryChip from "@/components/CategoryChip";
import { rupee } from "@/lib/format";
import { STOCK_META, stockLevelOf } from "./stockShared";
import { StockActions, InsightsPanel, ExpiryChip } from "./StockParts";

// Laptop view: totals up top, every tool as a button, full table below.
export default function StockDesktop({ vm }) {
  const { t, items, query, setQuery, filtered, tools, setShowAdd } = vm;
  const lowCount = items.filter((i) => stockLevelOf(i) === "low").length;
  const stockValue = items.reduce((s, i) => s + Number(i.stock) * Number(i.price), 0);
  return (
    <div className="pt-6">
      <div className="ks-card p-5 mb-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-10 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Items in stock")}</div>
            <div className="ks-display text-3xl font-bold">{items.length}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Low stock")}</div>
            <div className="ks-display text-3xl font-bold" style={lowCount ? { color: "var(--danger)" } : undefined}>{lowCount}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Stock value")}</div>
            <div className="ks-display text-3xl font-bold">{rupee(stockValue)}</div>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} className="ks-btn-primary flex items-center gap-1.5">
          <Plus size={16} /> {t("Add item")}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            placeholder={t("Search stock")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ks-input"
            style={{ paddingLeft: "2.25rem", paddingTop: 11, paddingBottom: 11 }}
          />
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
          {tools.map(({ icon: Icon, label, run }) => (
            <button key={label} onClick={run} className="ks-btn-outline flex items-center gap-1.5 !py-2.5 !px-3 text-[13px] whitespace-nowrap">
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <InsightsPanel vm={vm} />

      <div className="ks-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium">{t("Item")}</th>
              <th className="px-5 py-3 font-medium">{t("Category")}</th>
              <th className="px-5 py-3 font-medium">{t("Price")}</th>
              <th className="px-5 py-3 font-medium">{t("Stock")}</th>
              <th className="px-5 py-3 font-medium">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const stockMeta = STOCK_META[stockLevelOf(i)];
              return (
                <tr key={i.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-alt)]">
                  <td className="px-5 py-3 font-semibold max-w-[220px]">
                    <span className="truncate">{i.name}</span>
                  </td>
                  <td className="px-5 py-3">
                    <CategoryChip category={i.category} />
                  </td>
                  <td className="px-5 py-3 ks-mono">
                    {i.mrp > i.price && (
                      <div className="flex items-center gap-1.5">
                        <span className="line-through text-[11px]" style={{ color: "var(--text-secondary)" }}>{rupee(i.mrp)}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                          {Math.round(((i.mrp - i.price) / i.mrp) * 100)}% OFF
                        </span>
                      </div>
                    )}
                    {rupee(i.price)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="ks-mono font-semibold" style={{ color: stockMeta.text }}>
                      {i.stock} {i.unit}
                    </span>
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: stockMeta.bg, color: stockMeta.text }}>
                      {t(stockMeta.label)}
                    </span>
                    <span className="ml-2"><ExpiryChip vm={vm} id={i.id} /></span>
                  </td>
                  <td className="px-5 py-3">
                    <StockActions vm={vm} i={i} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">
                  {t("No items match \"{q}\".", { q: query })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
