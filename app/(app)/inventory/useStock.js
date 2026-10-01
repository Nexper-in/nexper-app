"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine, Upload, BarChart2, BookOpen } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { isPro } from "@/lib/pricing";
import { fetchShopItems, flattenShopProduct } from "@/lib/products";
import { useT } from "@/lib/i18n";
import { STOCK_RANK, stockLevelOf } from "./stockShared";

// All the Stock screen's data and actions. The phone and laptop screens
// (StockMobile / StockDesktop) both read from this and only differ in layout.
export function useStock() {
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

  // Less-used tools: a "⋯" menu on phones, buttons on the laptop.
  const tools = [
    { icon: BookOpen, label: t("Add from catalogue"), sub: t("Common Indian products"), run: () => setShowCatalogPicker(true) },
    { icon: ScanLine, label: t("Scan supplier bill"), sub: t("Photo of a printed bill"), run: () => (isPro(activeShop) ? setShowScanBill(true) : setShowScanUpgrade(true)) },
    { icon: Upload, label: t("Import a sheet"), sub: t("CSV of many items"), run: () => setShowBulkImport(true) },
    { icon: BarChart2, label: showInsights ? t("Hide profit per item") : t("Profit per item"), sub: t("Margin on each item"), run: () => setShowInsights((v) => !v) },
  ];

  return {
    t, supabase, activeShopId, activeShop, showToast,
    items, suppliers, loading, query, setQuery, filtered, insightItems, topMargin, tools,
    showAdd, setShowAdd, adjustItem, setAdjustItem, editPriceItem, setEditPriceItem,
    showScanBill, setShowScanBill, showInsights, setShowInsights, showBulkImport, setShowBulkImport,
    showCatalogPicker, setShowCatalogPicker, showTools, setShowTools, showScanUpgrade, setShowScanUpgrade,
    addItem, savePrice, logMovement, load,
  };
}
