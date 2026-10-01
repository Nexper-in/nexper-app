"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, ArrowUpCircle, ArrowDownCircle, Loader2, ScanLine, BarChart2, TrendingUp, TrendingDown, Upload, Pencil, BookOpen, MoreHorizontal } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import CategoryChip from "@/components/CategoryChip";
import AddItemModal from "@/components/AddItemModal";
import AdjustStockModal from "@/components/AdjustStockModal";
import EditPriceModal from "@/components/EditPriceModal";
import ScanBillModal from "@/components/ScanBillModal";
import BulkImportModal from "@/components/BulkImportModal";
import CatalogPickerModal from "@/components/CatalogPickerModal";
import UpgradePrompt from "@/components/UpgradePrompt";
import Modal from "@/components/ui/Modal";
import { isPro } from "@/lib/pricing";
import { nextCode } from "@/lib/inventoryHelpers";
import { rupee } from "@/lib/format";
import { fetchShopItems, flattenShopProduct } from "@/lib/products";
import ModuleGuard from "@/components/ModuleGuard";
import { T, useT } from "@/lib/i18n";

function stockLevelOf(i) {
  if (i.stock <= i.low_at) return "low";
  if (i.stock <= i.low_at * 3) return "medium";
  return "good";
}
const STOCK_RANK = { low: 0, medium: 1, good: 2 };
const STOCK_META = {
  low: { label: T("LOW"), text: "var(--danger)", bg: "var(--danger-soft)" },
  medium: { label: T("MEDIUM"), text: "var(--warn)", bg: "var(--warn-soft)" },
  good: { label: T("IN STOCK"), text: "var(--success)", bg: "var(--success-soft)" },
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
  const t = useT();
  const { supabase, activeShopId, activeShop, showToast, runQueued } = useShop();
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
  const [showTools, setShowTools] = useState(false);
  const [showScanUpgrade, setShowScanUpgrade] = useState(false);

  // Supports a "?add=1" deep link that jumps straight into the add-item flow.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("add") === "1") {
      setShowAdd(true);
      router.replace("/inventory");
    }
    // "?q=Maggi" (from Home's Needs attention list) opens Stock filtered to that item.
    if (params.get("q")) setQuery(params.get("q"));
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
    showToast(t("{name} added to stock", { name: merged.name }));
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
    showToast(t("{name}'s price updated", { name: merged.name }));
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
        ? `${type === "in" ? t("Stock added") : t("Stock removed")} ${t("(offline — will sync)")}: ${item.name}`
        : `${type === "in" ? t("Stock added") : t("Stock removed")}: ${item.name}`
    );
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading stock…")}
      </div>
    );
  }

  // Edit price, stock in, stock out. Wider buttons on the phone cards.
  function stockActions(i, wide) {
    const pill = `${wide ? "flex-1 justify-center py-2" : "px-2.5 py-1.5"} rounded-full text-xs font-semibold flex items-center gap-1`;
    return (
      <div className="flex gap-1.5">
        <button
          onClick={() => setEditPriceItem(i)}
          title={t("Edit price / MRP")}
          aria-label={t("Edit price of {name}", { name: i.name })}
          className={`${wide ? "w-9 h-9" : "w-7 h-7"} rounded-full flex items-center justify-center shrink-0`}
          style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
        >
          <Pencil size={13} />
        </button>
        <button onClick={() => setAdjustItem({ item: i, type: "in" })} className={pill} style={{ background: "var(--success-soft)", color: "var(--success)" }}>
          <ArrowUpCircle size={13} /> {t("In")}
        </button>
        <button onClick={() => setAdjustItem({ item: i, type: "out" })} className={pill} style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          <ArrowDownCircle size={13} /> {t("Out")}
        </button>
      </div>
    );
  }

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
                {[
                  { icon: BookOpen, label: t("Add from catalogue"), sub: t("Common Indian products"), run: () => setShowCatalogPicker(true) },
                  { icon: ScanLine, label: t("Scan supplier bill"), sub: t("Photo of a printed bill"), run: () => (isPro(activeShop) ? setShowScanBill(true) : setShowScanUpgrade(true)) },
                  { icon: Upload, label: t("Import a sheet"), sub: t("CSV of many items"), run: () => setShowBulkImport(true) },
                  { icon: BarChart2, label: showInsights ? t("Hide profit per item") : t("Profit per item"), sub: t("Margin on each item"), run: () => setShowInsights((v) => !v) },
                ].map(({ icon: Icon, label, sub, run }) => (
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

      {showInsights && (
        <div className="ks-card p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} style={{ color: "var(--accent-soft-text)" }} />
            <h2 className="ks-display font-bold">{t("Profit per item")}</h2>
            <span className="text-xs text-[var(--text-secondary)] ml-auto">{t("margin % on selling price")}</span>
          </div>
          {insightItems.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">{t("Add purchase prices to items to see profit insights.")}</p>
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
                        {isTop && !isLoss && <TrendingUp size={12} style={{ color: "var(--accent-soft-text)", flexShrink: 0 }} />}
                        {isLoss && <TrendingDown size={12} style={{ color: "var(--danger)", flexShrink: 0 }} />}
                        <span className="font-medium truncate">{i.name}</span>
                        <span className="ks-mono text-[10px] shrink-0 text-[var(--text-secondary)]">{rupee(i.margin)} / {i.unit}</span>
                      </div>
                      <span
                        className="ks-mono text-xs font-bold shrink-0 ml-3 px-2 py-0.5 rounded-full"
                        style={isLoss
                          ? { background: "var(--danger-soft)", color: "var(--danger)" }
                          : isTop
                          ? { background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }
                          : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
                      >
                        {i.marginPct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bg-surface-alt)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, barPct)}%`,
                          background: isLoss ? "var(--danger-solid)" : isTop ? "var(--accent)" : "var(--text-secondary)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {items.filter((i) => i.cost_price == null).length > 0 && (
            <p className="text-xs text-[var(--text-secondary)] mt-4">
              {items.filter((i) => i.cost_price == null).length} item{items.filter((i) => i.cost_price == null).length > 1 ? "s" : ""} missing purchase price — add it in inventory to track margin.
            </p>
          )}
        </div>
      )}

      {/* Phones: one card per item, so price, stock and actions all fit. */}
      <div className="ks-only-mobile ks-card overflow-hidden">
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
                {stockActions(i, true)}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">{t("No items match \"{q}\".", { q: query })}</p>
        )}
      </div>

      <div className="ks-only-desk ks-card overflow-hidden overflow-x-auto">
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
                  </td>
                  <td className="px-5 py-3">
                    {stockActions(i)}
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
      {showScanUpgrade && (
        <Modal title="Scan bill" onClose={() => setShowScanUpgrade(false)}>
          <UpgradePrompt
            feature="Supplier bill scanning"
            description="Photograph a supplier's paper bill and let Nexper read it — items and quantities update automatically instead of typing them in."
          />
        </Modal>
      )}
    </div>
  );
}
