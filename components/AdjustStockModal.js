"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

import { useT } from "@/lib/i18n";
export default function AdjustStockModal({ item, type, suppliers, onClose, onConfirm }) {
  const t = useT();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(type === "in" ? "Purchase" : "Damage/Wastage");
  const [supplier, setSupplier] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reasons = type === "in" ? ["Purchase", "Return from customer", "Correction"] : ["Damage/Wastage", "Personal use", "Correction"];
  const valid = Number(qty) > 0;

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm(Number(qty), reason, supplier.trim(), expiryDate || null);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={`${type === "in" ? t("Stock in") : t("Stock out")}: ${item.name}`} onClose={onClose}>
      <div className="space-y-3.5">
        <p className="text-xs text-[var(--text-secondary)]">
          {t("Current stock:")} <span className="ks-mono font-semibold text-[var(--text-primary)]">{item.stock} {item.unit}</span>
        </p>
        <Field label={t("Quantity ({unit})", { unit: item.unit })}>
          <input autoFocus type="number" className="ks-input" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label={t("Reason")}>
          <select className="ks-input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        {type === "in" && reason === "Purchase" && (
          <Field label={t("Supplier (optional)")}>
            <input
              className="ks-input"
              list="ks-supplier-list"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder={t("e.g. Ramesh Distributors")}
            />
            <datalist id="ks-supplier-list">
              {(suppliers || []).map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </Field>
        )}
        {type === "in" && (
          <Field label={t("Expiry date (optional)")}>
            <input type="date" className="ks-input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
        )}
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button
          disabled={!valid || saving}
          onClick={handleConfirm}
          className="w-full rounded-full text-white text-sm font-semibold py-2.5 disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: type === "in" ? "var(--accent)" : "var(--danger-solid)" }}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          Confirm {type === "in" ? "stock in" : "stock out"}
        </button>
      </div>
    </Modal>
  );
}
