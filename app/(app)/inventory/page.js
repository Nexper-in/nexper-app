"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, ArrowUpCircle, ArrowDownCircle, Loader2, ScanLine, BarChart2, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Upload, Pencil, BookOpen } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import CategoryChip from "@/components/CategoryChip";
import AddItemModal from "@/components/AddItemModal";
import AdjustStockModal from "@/components/AdjustStockModal";
import EditPriceModal from "@/components/EditPriceModal";
import ScanBillModal from "@/components/ScanBillModal";
import BulkImportModal from "@/components/BulkImportModal";
import CatalogPickerModal from "@/components/CatalogPickerModal";
import { nextCode } from "@/lib/inventoryHelpers";
import { rupee } from "@/lib/format";
import { fetchShopItems, flattenShopProduct } from "@/lib/products";
import ModuleGuard from "@/components/ModuleGuard";

function stockLevelOf(i) {
  if (i.stock <= i.low_at) return "low";
  if (i.stock <= i.low_at * 3) return "medium";
  return "good";
}
const STOCK_RANK = { low: 0, medium: 1, good: 2 };
const STOCK_META = {
  low: { label: "LOW", text: "#C13F45", bg: "#FDEAEA" },
  medium: { label: "MEDIUM", text: "#B5720B", bg: "#FFF4E0" },
  good: { label: "IN STOCK", text: "#1F8A5F", bg: "#E4F5F0" },
};

export default function InventoryPage() {
  return (
    <ModuleGuard module="inventory">
      <InventoryPageInner />
    </ModuleGuard>
  );
}

function InventoryPageInner() {
  const router = useRouter();
  const { supabase, activeShopId, showToast, runQueued } = useShop();
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [editPriceItem, setEditPriceItem] = useState(null);
  const [showScanBill, setShowScanBill] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);

  // Supports a "?add=1" deep link (e.g. from the dashboard's empty-stock
  // state) that jumps straight into the add-item flow.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("add") === "1") {
      setShowAdd(true);
      router.replace("/inventory");
    }
  }, [router]);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const [itemsData, { data: shopSuppliersData }] = await Promise.all([
      fetchShopItems(supabase, activeShopId),
      supabase.from("shop_suppliers").select("supplier:suppliers(*)").eq("shop_id", activeShopId),
    ]);
    setItems(itemsData);
    setSuppliers((shopSuppliersData || []).map((r) => r.supplier));
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  // Low/medium stock always floats to the top, regardless of search —
  // that's the whole point of the alert, it shouldn't require scrolling.
  const filtered = items
    .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()) || i.code?.includes(query.trim()))
    .sort((a, b) => STOCK_RANK[stockLevelOf(a)] - STOCK_RANK[stockLevelOf(b)]);

  // Profit insights: items with cost_price set, ranked by margin %
  const insightItems = items
    .filter((i) => i.cost_price != null && i.price > 0)
    .map((i) => ({
      ...i,
      margin: i.price - i.cost_price,
      marginPct: Math.round(((i.price - i.cost_price) / i.price) * 100),
    }))
    .sort((a, b) => b.marginPct - a.marginPct);
  const topMargin = insightItems[0]?.marginPct || 1;

  async function addItem(newItem) {
    const { code, price, mrp, cost_price, gst, stock, low_at, ...productFields } = newItem;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({ ...productFields, owner_id: user.id })
      .select()
      .single();
    if (productError) throw productError;

    const { data: shopProduct, error: spError } = await supabase
      .from("shop_products")
      .insert({ shop_id: activeShopId, product_id: product.id, code, price, mrp, cost_price, gst, stock, low_at })
      .select()
      .single();
    if (spError) throw spError;

    const merged = flattenShopProduct({ ...shopProduct, product });
    setItems((prev) => [...prev, merged].sort((a, b) => a.code.localeCompare(b.code)));
    setShowAdd(false);
    showToast(`${merged.name} added to inventory`);
  }

  async function savePrice(item, { price, mrp, cost_price }) {
    const { data, error } = await supabase
      .from("shop_products")
      .update({ price, mrp, cost_price })
      .eq("id", item.id)
      .select("*, product:products(*)")
      .single();
    if (error) throw error;
    const merged = flattenShopProduct(data);
    setItems((prev) => prev.map((p) => (p.id === item.id ? merged : p)));
    setEditPriceItem(null);
    showToast(`${merged.name}'s price updated`);
  }

  async function logMovement(item, type, qty, reason, supplier, expiryDate) {
    const result = await runQueued({
      type: "rpc",
      fn: "adjust_stock",
      args: {
        p_shop_id: activeShopId,
        p_shop_product_id: item.id,
        p_type: type,
        p_qty: qty,
        p_reason: reason,
        p_supplier: supplier || null,
        p_expiry_date: expiryDate || null,
      },
    });

    // Queued while offline — no server-confirmed stock yet, so apply the
    // same math locally; it reconciles once the queue flushes for real.
    const newStock = result.queued
      ? type === "in"
        ? Number(item.stock) + qty
        : Math.max(0, Number(item.stock) - qty)
      : result.data.stock;

    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, stock: newStock } : p)));
    setAdjustItem(null);
    showToast(
      result.queued
        ? `${type === "in" ? "Stock added" : "Stock removed"} (offline — will sync): ${item.name}`
        : `${type === "in" ? "Stock added" : "Stock removed"}: ${item.name}`
    );
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading inventory…
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0A996]" />
          <input
            placeholder="Search items..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ks-input"
            style={{ paddingLeft: "2.25rem" }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowInsights((v) => !v)}
            className="ks-btn-outline flex items-center gap-1.5"
          >
            <BarChart2 size={15} /> Insights {showInsights ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            onClick={() => setShowCatalogPicker(true)}
            className="ks-btn-outline flex items-center gap-1.5"
            title="Add common Indian grocery items instantly"
          >
            <BookOpen size={15} /> Catalogue
          </button>
          <button
            onClick={() => setShowBulkImport(true)}
            className="ks-btn-outline flex items-center gap-1.5"
            title="Import multiple items from CSV"
          >
            <Upload size={15} /> Import
          </button>
          <button
            onClick={() => setShowScanBill(true)}
            className="ks-btn-outline flex items-center gap-1.5"
            title="Scan supplier bill to auto-update stock"
          >
            <ScanLine size={15} /> Scan bill
          </button>
          <button onClick={() => setShowAdd(true)} className="ks-btn-primary flex items-center gap-1.5">
            <Plus size={16} /> Add item
          </button>
        </div>
      </div>

      {showInsights && (
        <div className="ks-card p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} style={{ color: "#4F46E5" }} />
            <h2 className="ks-display font-bold">Profit per item</h2>
            <span className="text-xs text-[#6B7280] ml-auto">margin % on selling price</span>
          </div>
          {insightItems.length === 0 ? (
            <p className="text-sm text-[#6B7280]">Add purchase prices to items to see profit insights.</p>
          ) : (
            <div className="space-y-3">
              {insightItems.map((i, idx) => {
                const barPct = Math.round((i.marginPct / topMargin) * 100);
                const isTop = idx < 3;
                const isLoss = i.marginPct < 0;
                return (
                  <div key={i.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {isTop && !isLoss && <TrendingUp size={12} style={{ color: "#4F46E5", flexShrink: 0 }} />}
                        {isLoss && <TrendingDown size={12} style={{ color: "#C13F45", flexShrink: 0 }} />}
                        <span className="font-medium truncate">{i.name}</span>
                        <span className="ks-mono text-[10px] shrink-0 text-[#6B7280]">{rupee(i.margin)} / {i.unit}</span>
                      </div>
                      <span
                        className="ks-mono text-xs font-bold shrink-0 ml-3 px-2 py-0.5 rounded-full"
                        style={isLoss
                          ? { background: "#FDEAEA", color: "#C13F45" }
                          : isTop
                          ? { background: "#EEF0FB", color: "#4F46E5" }
                          : { background: "#F3F4F8", color: "#6B7280" }}
                      >
                        {i.marginPct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#F3F4F8] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, barPct)}%`,
                          background: isLoss ? "#C13F45" : isTop ? "#4F46E5" : "#B0A996",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {items.filter((i) => i.cost_price == null).length > 0 && (
            <p className="text-xs text-[#B0A996] mt-4">
              {items.filter((i) => i.cost_price == null).length} item{items.filter((i) => i.cost_price == null).length > 1 ? "s" : ""} missing purchase price — add it in inventory to track margin.
            </p>
          )}
        </div>
      )}

      <div className="ks-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[#6B7280] border-b border-[#E7E9F3]">
              <th className="px-5 py-3 font-medium">Item</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Stock</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const stockMeta = STOCK_META[stockLevelOf(i)];
              return (
                <tr key={i.id} className="border-b border-[#E7E9F3] last:border-0 hover:bg-[#F8F9FD]">
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
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#E4F5F0", color: "#1F8A5F" }}>
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
                      {stockMeta.label}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setEditPriceItem(i)}
                        title="Edit price / MRP"
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: "#E7E9F3", color: "#6B7280" }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setAdjustItem({ item: i, type: "in" })}
                        className="px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
                        style={{ background: "#E4F5F0", color: "#4F46E5" }}
                      >
                        <ArrowUpCircle size={13} /> In
                      </button>
                      <button
                        onClick={() => setAdjustItem({ item: i, type: "out" })}
                        className="px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
                        style={{ background: "#FDEAEA", color: "#C13F45" }}
                      >
                        <ArrowDownCircle size={13} /> Out
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[#6B7280] text-sm">
                  No items match &quot;{query}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showBulkImport && (
        <BulkImportModal
          onClose={() => { setShowBulkImport(false); load(); }}
          onImport={addItem}
          nextCode={() => nextCode(items)}
        />
      )}
      {showCatalogPicker && (
        <CatalogPickerModal
          onClose={() => { setShowCatalogPicker(false); load(); }}
          onImport={addItem}
          nextCode={() => nextCode(items)}
        />
      )}
      {showAdd && <AddItemModal items={items} onClose={() => setShowAdd(false)} onAdd={addItem} />}
      {adjustItem && (
        <AdjustStockModal
          item={adjustItem.item}
          type={adjustItem.type}
          suppliers={suppliers}
          onClose={() => setAdjustItem(null)}
          onConfirm={(qty, reason, supplier, expiryDate) => logMovement(adjustItem.item, adjustItem.type, qty, reason, supplier, expiryDate)}
        />
      )}
      {editPriceItem && (
        <EditPriceModal
          item={editPriceItem}
          onClose={() => setEditPriceItem(null)}
          onSave={(fields) => savePrice(editPriceItem, fields)}
        />
      )}
      {showScanBill && (
        <ScanBillModal
          items={items}
          supabase={supabase}
          activeShopId={activeShopId}
          showToast={showToast}
          onClose={() => setShowScanBill(false)}
          onDone={() => { setShowScanBill(false); load(); }}
        />
      )}
    </div>
  );
}
