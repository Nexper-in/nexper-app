"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, Package, CheckCircle2, Send, ClipboardList, Copy, MessageCircle, Sparkles } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { fetchShopItems } from "@/lib/products";
import CreatePOModal from "@/components/CreatePOModal";
import ReceivePOModal from "@/components/ReceivePOModal";
import ModuleGuard from "@/components/ModuleGuard";
import { whatsappLink, purchaseOrderText } from "@/lib/messaging";
import { T, useT } from "@/lib/i18n";

const SETUP_SQL = `-- Run this in your Supabase dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','received')),
  expected_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  shop_product_id UUID REFERENCES shop_products(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  item_code TEXT,
  qty NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC,
  unit TEXT DEFAULT 'pcs'
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_owner" ON purchase_orders FOR ALL
  USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "po_items_owner" ON purchase_order_items FOR ALL
  USING (po_id IN (
    SELECT po.id FROM purchase_orders po
    JOIN shops s ON po.shop_id = s.id
    WHERE s.owner_id = auth.uid()
  ));`;

const STATUS_META = {
  draft:    { label: T("Draft"),    bg: "var(--warn-soft)", color: "var(--warn)" },
  sent:     { label: T("Sent"),     bg: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" },
  received: { label: T("Received"), bg: "var(--success-soft)", color: "var(--success)" },
};

export default function PurchaseOrdersPage() {
  return (
    <ModuleGuard module="purchase_orders" proOnly proLabel="Purchase Orders">
      <POPageInner />
    </ModuleGuard>
  );
}

function POPageInner() {
  const t = useT();
  const { supabase, activeShop, activeShopId, runQueued, showToast } = useShop();
  const [initialLines, setInitialLines] = useState(null); // lines pre-filled by "Suggest an order"
  const [pos, setPOs] = useState([]);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [receiving, setReceiving] = useState(null); // po being received (opens the quantities form)

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const [{ data: posData, error }, itemsData, { data: suppData }] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select("*, items:purchase_order_items(*)")
        .eq("shop_id", activeShopId)
        .order("created_at", { ascending: false }),
      fetchShopItems(supabase, activeShopId),
      supabase.from("shop_suppliers").select("supplier:suppliers(*)").eq("shop_id", activeShopId),
    ]);
    if (error?.code === "42P01") { setNeedsSetup(true); setLoading(false); return; }
    setPOs(posData || []);
    setItems(itemsData);
    setSuppliers((suppData || []).map((r) => r.supplier));
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => { load(); }, [load]);

  async function createPO({ supplier_id, supplier_name, expected_date, notes, lines }) {
    const { data: po, error } = await supabase
      .from("purchase_orders")
      .insert({ shop_id: activeShopId, supplier_id, supplier_name, expected_date, notes, status: "draft" })
      .select()
      .single();
    if (error) throw error;
    if (lines.length) {
      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(lines.map((l) => ({ ...l, po_id: po.id })));
      if (itemsError) {
        // Don't leave a permanent empty draft PO behind if its items
        // failed to save — clean up before surfacing the error.
        await supabase.from("purchase_orders").delete().eq("id", po.id);
        throw itemsError;
      }
    }
    setShowCreate(false);
    setInitialLines(null);
    showToast(t("Purchase order created"));
    load();
  }

  async function updateStatus(po, status) {
    if (status === "received") {
      // Ask what actually arrived (and expiry dates) first.
      setReceiving(po);
      return;
    }

    const { error } = await supabase
      .from("purchase_orders")
      .update({ status })
      .eq("id", po.id);
    if (error) { showToast(error.message, "err"); return; }
    load();
  }

  // Adds the stock for what arrived. receive_purchase_order_lines (migration
  // 026) records quantities and expiry as batches; if it isn't installed yet,
  // fall back to the older receive-everything function.
  async function confirmReceive(lines) {
    let { error } = await supabase.rpc("receive_purchase_order_lines", { p_po_id: receiving.id, p_shop_id: activeShopId, p_lines: lines });
    if (error && /does not exist|schema cache/i.test(error.message)) {
      ({ error } = await supabase.rpc("receive_purchase_order", { p_po_id: receiving.id, p_shop_id: activeShopId }));
    }
    if (error) throw error;
    setReceiving(null);
    showToast(t("Stock updated from purchase order"));
    load();
  }

  // Opens WhatsApp with the order ready for the supplier. A draft becomes "sent".
  async function sendOnWhatsApp(po) {
    const phone = suppliers.find((s) => s.id === po.supplier_id)?.phone || "";
    const text = purchaseOrderText({ shopName: activeShop?.name, supplierName: po.supplier_name, lines: po.items || [], expectedDate: po.expected_date, notes: po.notes });
    window.open(phone ? whatsappLink(phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    if (po.status === "draft") await updateStatus(po, "sent");
  }

  // Everything at or below its low-stock level, topped up to three times that.
  function suggestOrder() {
    const lines = items
      .filter((i) => i.stock <= i.low_at)
      .map((i) => ({
        shop_product_id: i.id,
        item_name: i.name,
        unit: i.unit || "pcs",
        qty: Math.max(1, Math.round(Number(i.low_at) * 3 - Number(i.stock))),
        unit_price: i.cost_price ?? "",
      }));
    if (lines.length === 0) {
      showToast(t("Nothing is low on stock right now."));
      return;
    }
    setInitialLines(lines);
    setShowCreate(true);
  }

  function copySQL() {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return (
    <div className="pt-6 flex items-center gap-2 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> {t("Loading purchase orders…")}
    </div>
  );

  if (needsSetup) return (
    <div className="pt-6 max-w-lg">
      <div className="ks-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <ClipboardList size={28} style={{ color: "var(--accent-soft-text)" }} />
          <div>
            <h2 className="font-bold text-lg">One-time setup needed</h2>
            <p className="text-sm text-[var(--text-secondary)]">Purchase orders need 2 new database tables.</p>
          </div>
        </div>
        <ol className="text-sm space-y-2 text-[var(--text-primary)]">
          <li>1. Copy the SQL below</li>
          <li>2. Open your <strong>Supabase dashboard → SQL Editor</strong></li>
          <li>3. Paste and click <strong>Run</strong></li>
          <li>4. Refresh this page</li>
        </ol>
        <div className="relative">
          <pre className="text-[11px] rounded-xl p-4 overflow-x-auto ks-scroll" style={{ background: "#1E1E2E", color: "#CDD6F4", maxHeight: "240px" }}>
            {SETUP_SQL}
          </pre>
          <button
            onClick={copySQL}
            className="absolute top-2 right-2 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg"
            style={{ background: copied ? "var(--accent)" : "#313244", color: "#CDD6F4" }}
          >
            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );

  const draft = pos.filter((p) => p.status === "draft");
  const sent = pos.filter((p) => p.status === "sent");
  const received = pos.filter((p) => p.status === "received");

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="ks-display font-bold text-lg">{t("Purchase orders")}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{t("{total} total · {draft} draft · {sent} sent", { total: pos.length, draft: draft.length, sent: sent.length })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={suggestOrder} className="ks-btn-outline flex items-center gap-1.5 text-sm">
            <Sparkles size={15} /> {t("Suggest an order")}
          </button>
          <button onClick={() => { setInitialLines(null); setShowCreate(true); }} className="ks-btn-primary flex items-center gap-1.5">
            <Plus size={16} /> {t("New order")}
          </button>
        </div>
      </div>

      {pos.length === 0 && (
        <div className="ks-card p-10 text-center">
          <Package size={36} className="mx-auto mb-3" style={{ color: "var(--text-secondary)" }} />
          <p className="font-semibold text-[var(--text-primary)]">{t("No purchase orders yet")}</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1 mb-4">{t("Create an order to track what you're buying from suppliers.")}</p>
          <button onClick={() => setShowCreate(true)} className="ks-btn-primary">
            <Plus size={15} className="mr-1.5" /> {t("Create first order")}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {pos.map((po) => {
          const meta = STATUS_META[po.status];
          const total = (po.items || []).reduce((s, l) => s + (l.unit_price || 0) * l.qty, 0);
          const itemCount = (po.items || []).length;
          return (
            <div key={po.id} className="ks-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {t(meta.label)}
                    </span>
                    <span className="font-semibold text-sm">{po.supplier_name || t("Unknown supplier")}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {itemCount === 1 ? t("{n} item", { n: 1 }) : t("{n} items", { n: itemCount })}
                    {total > 0 ? ` · ${t("{amt} estimated", { amt: rupee(total) })}` : ""}
                    {po.expected_date ? ` · ${t("Expected {date}", { date: new Date(po.expected_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })}` : ""}
                  </p>
                  {po.notes && <p className="text-xs text-[var(--text-secondary)] mt-0.5 italic">{po.notes}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {po.status !== "received" && (
                    <button
                      onClick={() => sendOnWhatsApp(po)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
                      style={{ background: "#25D366" }}
                    >
                      <MessageCircle size={13} /> {t("Send on WhatsApp")}
                    </button>
                  )}
                  {po.status === "draft" && (
                    <button
                      onClick={() => updateStatus(po, "sent")}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
                      style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}
                    >
                      <Send size={13} /> {t("Mark sent")}
                    </button>
                  )}
                  {po.status === "sent" && (
                    <button
                      onClick={() => updateStatus(po, "received")}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
                      style={{ background: "var(--success-soft)", color: "var(--success)" }}
                    >
                      <CheckCircle2 size={13} /> {t("Mark received + stock up")}
                    </button>
                  )}
                </div>
              </div>
              {/* Item list */}
              {(po.items || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {(po.items || []).map((line) => (
                    <div key={line.id} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg" style={{ background: "var(--bg-surface-alt)" }}>
                      <span className="font-medium truncate">{line.item_name}</span>
                      <span className="ks-mono text-[var(--text-secondary)] ml-2 shrink-0">{line.qty} {line.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreatePOModal
          items={items}
          suppliers={suppliers}
          initialLines={initialLines}
          onClose={() => { setShowCreate(false); setInitialLines(null); }}
          onCreate={createPO}
        />
      )}
      {receiving && <ReceivePOModal po={receiving} onClose={() => setReceiving(null)} onConfirm={confirmReceive} />}
    </div>
  );
}
