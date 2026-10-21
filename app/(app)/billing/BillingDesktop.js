"use client";

import { Gamepad2 } from "lucide-react";
import { hasFeature } from "@/lib/platformConfig";
import { SearchBox, FindItems, BillPanel } from "./BillingParts";

// Laptop view: items on the left, the bill on the right, side by side.
// Search is focused on arrival and categories are one click.
export default function BillingDesktop({ vm }) {
  const { t, activeShop, nextBillNo, categories, activeCategory, setActiveCategory, query, setGamePicker } = vm;
  return (
    <div className="pt-6">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="ks-display font-bold text-xl">{t("New bill")}</h1>
        <span className="ks-mono text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>{nextBillNo}</span>
      </div>
      <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "minmax(0, 3fr) minmax(360px, 2fr)" }}>
        <div className="min-w-0">
          <div className="relative mb-3">
            <SearchBox vm={vm} autoFocus />
          </div>
          {(categories.length > 0 || hasFeature(activeShop, "play_area")) && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {categories.map((c) => {
                const on = activeCategory === c && !query;
                return (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(on ? null : c)}
                    aria-pressed={on}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                    style={on ? { background: "var(--strong)", color: "var(--on-strong)" } : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
                  >
                    {c}
                  </button>
                );
              })}
              {hasFeature(activeShop, "play_area") && (
                // Not an item category -- there's nothing to filter the grid by. Tapping it
                // opens the same "Add game charge" picker as the button below the cart, so a
                // cashier browsing items doesn't have to scroll down to find it.
                <button
                  type="button"
                  onClick={() => setGamePicker(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                  style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
                >
                  <Gamepad2 size={13} /> {t("Play area")}
                </button>
              )}
            </div>
          )}
          <FindItems vm={vm} wide />
        </div>
        <BillPanel vm={vm} wide />
      </div>
    </div>
  );
}
