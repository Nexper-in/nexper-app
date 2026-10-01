"use client";

import { Search, Plus, MoreHorizontal } from "lucide-react";
import CategoryChip from "@/components/CategoryChip";
import { rupee } from "@/lib/format";
import { STOCK_META, stockLevelOf } from "./stockShared";
import { StockActions, InsightsPanel, ExpiryChip } from "./StockParts";

// Phone view: search, Add item and one "⋯" menu, then one card per item.
export default function StockMobile({ vm }) {
  const { t, query, setQuery, filtered, tools, showTools, setShowTools, setShowAdd } = vm;
  return (
    <div className="pt-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            placeholder={t("Search stock")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ks-input"
            style={{ paddingLeft: "2.25rem", paddingTop: 11, paddingBottom: 11 }}
          />
        </div>
        <button onClick={() => setShowAdd(true)} className="ks-btn-primary flex items-center gap-1.5 shrink-0 py-2.5">
          <Plus size={16} /> {t("Add item")}
        </button>
        {/* Less-used tools live behind one button */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowTools((v) => !v)}
            aria-label={t("More stock tools")}
            aria-expanded={showTools}
            className="ks-btn-outline w-11 h-11 !p-0 flex items-center justify-center"
          >
            <MoreHorizontal size={18} />
          </button>
          {showTools && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowTools(false)} />
              <div className="ks-card absolute right-0 top-[calc(100%+6px)] z-50 w-60 p-1.5 ks-fade-up" style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
                {tools.map(({ icon: Icon, label, sub, run }) => (
                  <button
                    key={label}
                    onClick={() => {
                      setShowTools(false);
                      run();
                    }}
                    className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left hover:bg-[var(--bg-surface-alt)]"
                  >
                    <span className="ks-tint-icon">
                      <Icon size={15} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-[11px]" style={{ color: "var(--text-secondary)" }}>{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <InsightsPanel vm={vm} />

      <div className="ks-card overflow-hidden">
        {filtered.map((i) => {
          const stockMeta = STOCK_META[stockLevelOf(i)];
          return (
            <div key={i.id} className="p-4 border-b border-[var(--border)] last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{i.name}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <CategoryChip category={i.category} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: stockMeta.bg, color: stockMeta.text }}>
                      {i.stock} {i.unit} · {t(stockMeta.label)}
                    </span>
                    <ExpiryChip vm={vm} id={i.id} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {i.mrp > i.price && (
                    <span className="block line-through text-[11px] ks-mono" style={{ color: "var(--text-secondary)" }}>{rupee(i.mrp)}</span>
                  )}
                  <span className="ks-mono font-bold">{rupee(i.price)}</span>
                </div>
              </div>
              <div className="mt-3">
                <StockActions vm={vm} i={i} wide />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">{t("No items match \"{q}\".", { q: query })}</p>
        )}
      </div>
    </div>
  );
}
