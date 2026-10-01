"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Loader2, Layers, Barcode } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import CategoryChip from "@/components/CategoryChip";
import BatchesModal from "@/components/BatchesModal";
import BarcodeModal from "@/components/BarcodeModal";
import { fetchShopItems } from "@/lib/products";
import ModuleGuard from "@/components/ModuleGuard";

export default function InventoryConfigPage() {
  return (
    <ModuleGuard module="inventory">
      <InventoryConfigPageInner />
    </ModuleGuard>
  );
}

function InventoryConfigPageInner() {
  const { supabase, activeShopId } = useShop();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [batchesItem, setBatchesItem] = useState(null);
  const [barcodeItem, setBarcodeItem] = useState(null);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    setItems(await fetchShopItems(supabase, activeShopId));
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading config…
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="mb-4">
        <h1 className="ks-display font-bold text-xl">Batches &amp; barcodes</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Batch tracking (FIFO/expiry) and barcode printing, per item.
        </p>
      </div>

      <div className="relative w-full max-w-xs mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input
          placeholder="Search items..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ks-input"
          style={{ paddingLeft: "2.25rem" }}
        />
      </div>

      <div className="ks-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium">Item</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-alt)]">
                <td className="px-5 py-3 font-semibold max-w-[220px]">
                  <span className="truncate">{i.name}</span>
                </td>
                <td className="px-5 py-3">
                  <CategoryChip category={i.category} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setBatchesItem(i)}
                      className="px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
                      style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
                    >
                      <Layers size={13} /> Batches
                    </button>
                    <button
                      onClick={() => setBarcodeItem(i)}
                      className="px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
                      style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
                    >
                      <Barcode size={13} /> Barcode
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">
                  No items match &quot;{query}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {batchesItem && (
        <BatchesModal item={batchesItem} supabase={supabase} activeShopId={activeShopId} onClose={() => setBatchesItem(null)} />
      )}
      {barcodeItem && <BarcodeModal item={barcodeItem} onClose={() => setBarcodeItem(null)} />}
    </div>
  );
}
