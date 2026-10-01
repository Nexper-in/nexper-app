"use client";

import Modal from "@/components/ui/Modal";
import { rupee } from "@/lib/format";

export default function StatDetailModal({ mode, items, todaysBills, stockValue, onClose, onGoInventory, onAddItems }) {
  const titles = { items: "Items in stock", value: "Stock value breakdown", low: "Low stock items", profit: "Today's profit breakdown" };
  let rows = items;
  if (mode === "low") rows = items.filter((i) => i.stock <= i.low_at);
  if (mode === "value") rows = [...items].sort((a, b) => b.stock * b.price - a.stock * a.price);

  let profitRows = [];
  let totalProfit = 0;
  if (mode === "profit") {
    const map = new Map();
    (todaysBills || []).forEach((b) =>
      (b.items || []).forEach((line) => {
        const item = items.find((i) => i.id === line.shop_product_id);
        // No purchase price on record — exclude rather than assume zero
        // cost, which would count the whole sale as profit.
        if (!item || item.cost_price == null) return;
        const profit = (line.price - item.cost_price) * line.qty;
        const cur = map.get(line.shop_product_id) || { name: line.name, code: line.code, profit: 0 };
        cur.profit += profit;
        map.set(line.shop_product_id, cur);
      })
    );
    profitRows = [...map.values()].sort((a, b) => b.profit - a.profit);
    totalProfit = profitRows.reduce((s, r) => s + r.profit, 0);
  }

  return (
    <Modal title={titles[mode]} onClose={onClose}>
      <div className="space-y-3">
        {mode === "value" && (
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Total stock value</span>
            <span className="ks-mono text-lg font-bold text-[var(--accent-soft-text)]">{rupee(stockValue)}</span>
          </div>
        )}
        {mode === "profit" && (
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Total profit today</span>
            <span className="ks-mono text-lg font-bold text-[var(--accent-soft-text)]">{rupee(totalProfit)}</span>
          </div>
        )}

        {mode === "profit" ? (
          <div className="max-h-80 overflow-y-auto ks-scroll space-y-2.5 pr-1">
            {profitRows.length === 0 && <p className="text-sm text-[var(--text-secondary)] text-center py-6">No sales yet today.</p>}
            {profitRows.map((r) => (
              <div key={r.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="ks-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}>
                    {r.code}
                  </span>
                  <span className="font-medium truncate">{r.name}</span>
                </div>
                <span className="ks-mono font-semibold shrink-0 ml-2 text-[var(--accent-soft-text)]">{rupee(r.profit)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto ks-scroll space-y-2.5 pr-1">
            {rows.length === 0 && (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">Nothing to show here. 🎉</p>
                {(mode === "items" || mode === "value") && (
                  <button onClick={onAddItems} className="ks-btn-primary">
                    Add items
                  </button>
                )}
              </div>
            )}
            {rows.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="ks-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}>
                    {i.code}
                  </span>
                  <span className="font-medium truncate">{i.name}</span>
                </div>
                {mode === "value" ? (
                  <span className="ks-mono font-semibold shrink-0 ml-2">{rupee(i.stock * i.price)}</span>
                ) : (
                  <span className={`ks-mono font-semibold shrink-0 ml-2 ${i.stock <= i.low_at ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
                    {i.stock} {i.unit}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {mode === "low" && rows.length > 0 && (
          <button onClick={onGoInventory} className="ks-btn-primary w-full mt-1">
            Go to Inventory to restock
          </button>
        )}
      </div>
    </Modal>
  );
}
