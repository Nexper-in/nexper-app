"use client";

import { TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, Pencil } from "lucide-react";
import AddItemModal from "@/components/AddItemModal";
import AdjustStockModal from "@/components/AdjustStockModal";
import EditPriceModal from "@/components/EditPriceModal";
import ScanBillModal from "@/components/ScanBillModal";
import BulkImportModal from "@/components/BulkImportModal";
import CatalogPickerModal from "@/components/CatalogPickerModal";
import UpgradePrompt from "@/components/UpgradePrompt";
import Modal from "@/components/ui/Modal";
import { nextCode } from "@/lib/inventoryHelpers";
import { rupee } from "@/lib/format";

// Edit price, stock in, stock out. Wider buttons on the phone cards.
export function StockActions({ vm, i, wide }) {
  const { t, setEditPriceItem, setAdjustItem } = vm;
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

// "Profit per item" panel, opened from the tools.
export function InsightsPanel({ vm }) {
  const { t, items, insightItems, topMargin, showInsights } = vm;
  return (
    <>
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
    </>
  );
}

export function StockModals({ vm }) {
  const {
    t, supabase, activeShopId, showToast, items, suppliers, load, addItem, savePrice, logMovement,
    showAdd, setShowAdd, adjustItem, setAdjustItem, editPriceItem, setEditPriceItem,
    showScanBill, setShowScanBill, showBulkImport, setShowBulkImport,
    showCatalogPicker, setShowCatalogPicker, showScanUpgrade, setShowScanUpgrade,
  } = vm;
  return (
    <>
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
    </>
  );
}

// "Expires in 3d" / "Expired" chip for an item with a batch expiring within 14 days.
export function ExpiryChip({ vm, id }) {
  const { t, expiryDays } = vm;
  const days = expiryDays[id];
  if (days === undefined) return null;
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
      style={days <= 0 ? { background: "var(--danger-soft)", color: "var(--danger)" } : { background: "var(--warn-soft)", color: "var(--warn)" }}
    >
      {days < 0 ? t("Expired") : days === 0 ? t("expires today") : t("expires in {n}d", { n: days })}
    </span>
  );
}
