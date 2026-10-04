"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useT } from "@/lib/i18n";

// Asks what actually arrived for each line of an order (default: all of it),
// and an optional expiry date, before the stock is added.
export default function ReceivePOModal({ po, onClose, onConfirm }) {
  const t = useT();
  const [rows, setRows] = useState(
    (po.items || []).map((l) => ({ line_id: l.id, item_name: l.item_name, unit: l.unit || "pcs", ordered: l.qty, qty: String(l.qty), expiry_date: "", linked: Boolean(l.shop_product_id) }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(i, patch) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm(rows.map((r) => ({ line_id: r.line_id, qty: Number(r.qty) || 0, expiry_date: r.expiry_date || null })));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Receive order")} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
        {t("Enter what actually arrived. Add an expiry date if the pack has one.")}
      </p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.line_id} className="rounded-xl p-3" style={{ background: "var(--bg-surface-alt)" }}>
            <p className="text-sm font-semibold truncate">{r.item_name}</p>
            {!r.linked && <p className="text-[11px]" style={{ color: "var(--warn)" }}>{t("Not linked to a stock item, so it won't be added.")}</p>}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {t("Arrived ({unit}, ordered {n})", { unit: r.unit, n: r.ordered })}
                <input type="number" min="0" inputMode="decimal" className="ks-input ks-mono mt-1" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} />
              </label>
              <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {t("Expiry date")}
                <input type="date" className="ks-input mt-1" value={r.expiry_date} onChange={(e) => set(i, { expiry_date: e.target.value })} />
              </label>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2 mt-3">{error}</p>}
      <button disabled={saving} onClick={confirm} className="ks-btn-primary w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-40">
        {saving && <Loader2 size={16} className="animate-spin" />}
        {t("Add to stock")}
      </button>
    </Modal>
  );
}
