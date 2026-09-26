"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, Package, CheckCircle2, Send, ClipboardList, Copy } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { fetchShopItems } from "@/lib/products";
import CreatePOModal from "@/components/CreatePOModal";
import ModuleGuard from "@/components/ModuleGuard";

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
  draft:    { label: "Draft",    bg: "#FFF4E0", color: "#B5720B" },
  sent:     { label: "Sent",     bg: "#EEF0FB", color: "#4F46E5" },
  received: { label: "Received", bg: "#E8F5E9", color: "#2E7D32" },
};

export default function PurchaseOrdersPage() {
  return (
    <ModuleGuard module="purchase_orders" proOnly proLabel="Purchase Orders">
      <POPageInner />
    </ModuleGuard>
  );
}

function POPageInner() {
  const { supabase, activeShopId, runQueued, showToast } = useShop();
  const [pos, setPOs] = useState([]);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [receiving, setReceiving] = useState(null); // po being received

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
    showToast("Purchase order created");
    load();
  }

  async function updateStatus(po, status) {
    if (status === "received") {
      // receive_purchase_order() does the stock updates, movement log
      // entries, and status flip as one all-or-nothing transaction — so
      // a failure partway (a deleted product, etc.) leaves the PO
      // exactly as it was, not stuck "Received" with missing stock.
      try {
        await runQueued({
          type: "rpc",
          fn: "receive_purchase_order",
          args: { p_po_id: po.id, p_shop_id: activeShopId },
        });
        showToast("Stock updated from purchase order");
      } catch (err) {
        showToast(err.message, "err");
      }
      load();
      return;
    }

    const { error } = await supabase
      .from("purchase_orders")
      .update({ status })
      .eq("id", po.id);
    if (error) { showToast(error.message, "err"); return; }
    load();
  }

  function copySQL() {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return (
    <div className="pt-6 flex items-center gap-2 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> Loading purchase orders…
    </div>
  );

  if (needsSetup) return (
    <div className="pt-6 max-w-lg">
      <div className="ks-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <ClipboardList size={28} style={{ color: "#4F46E5" }} />
          <div>
            <h2 className="font-bold text-lg">One-time setup needed</h2>
            <p className="text-sm text-[#6B7280]">Purchase orders need 2 new database tables.</p>
          </div>
        </div>
        <ol className="text-sm space-y-2 text-[#374151]">
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
            style={{ background: copied ? "#4F46E5" : "#313244", color: "#CDD6F4" }}
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
          <h1 className="ks-display font-bold text-lg">Purchase orders</h1>
          <p className="text-sm text-[#6B7280]">{pos.length} total · {draft.length} draft · {sent.length} sent</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="ks-btn-primary flex items-center gap-1.5">
          <Plus size={16} /> New order
        </button>
      </div>

      {pos.length === 0 && (
        <div className="ks-card p-10 text-center">
          <Package size={36} className="mx-auto mb-3" style={{ color: "#B0A996" }} />
          <p className="font-semibold text-[#374151]">No purchase orders yet</p>
          <p className="text-sm text-[#6B7280] mt-1 mb-4">Create an order to track what you&apos;re buying from suppliers.</p>
          <button onClick={() => setShowCreate(true)} className="ks-btn-primary">
            <Plus size={15} className="mr-1.5" /> Create first order
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
                      {meta.label}
                    </span>
                    <span className="font-semibold text-sm">{po.supplier_name || "Unknown supplier"}</span>
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                    {total > 0 ? ` · ${rupee(total)} estimated` : ""}
                    {po.expected_date ? ` · Expected ${new Date(po.expected_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                  </p>
                  {po.notes && <p className="text-xs text-[#B0A996] mt-0.5 italic">{po.notes}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {po.status === "draft" && (
                    <button
                      onClick={() => updateStatus(po, "sent")}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
                      style={{ background: "#EEF0FB", color: "#4F46E5" }}
                    >
                      <Send size={13} /> Mark sent
                    </button>
                  )}
                  {po.status === "sent" && (
                    <button
                      onClick={() => updateStatus(po, "received")}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
                      style={{ background: "#E8F5E9", color: "#2E7D32" }}
                    >
                      <CheckCircle2 size={13} /> Mark received + stock up
                    </button>
                  )}
                </div>
              </div>
              {/* Item list */}
              {(po.items || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#F3F4F8] grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {(po.items || []).map((line) => (
                    <div key={line.id} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg" style={{ background: "#F8F9FD" }}>
                      <span className="font-medium truncate">{line.item_name}</span>
                      <span className="ks-mono text-[#6B7280] ml-2 shrink-0">{line.qty} {line.unit}</span>
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
          onClose={() => setShowCreate(false)}
          onCreate={createPO}
        />
      )}
    </div>
  );
}
