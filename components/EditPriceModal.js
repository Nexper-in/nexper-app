"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

import { useT } from "@/lib/i18n";
export default function EditPriceModal({ item, onClose, onSave, onDelete }) {
  const t = useT();
  const [price, setPrice] = useState(String(item.price ?? ""));
  const [mrp, setMrp] = useState(item.mrp != null ? String(item.mrp) : "");
  const [costPrice, setCostPrice] = useState(item.cost_price != null ? String(item.cost_price) : "");
  const [trackStock, setTrackStock] = useState(item.track_stock !== false);
  const [packSize, setPackSize] = useState(item.pack_size != null ? String(item.pack_size) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = Number(price) > 0 && (mrp === "" || Number(mrp) > Number(price));

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave({
        price: Number(price),
        mrp: mrp !== "" ? Number(mrp) : null,
        cost_price: costPrice !== "" ? Number(costPrice) : null,
        track_stock: trackStock,
        pack_size: packSize !== "" ? Number(packSize) : null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("Delete {name}? This can't be undone.", { name: item.name }))) return;
    setSaving(true);
    setError("");
    try {
      await onDelete();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Edit price: {name}", { name: item.name })} onClose={onClose}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Selling price (₹)")}>
            <input autoFocus type="number" className="ks-input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label={t("MRP (₹, optional)")}>
            <input
              type="number"
              className="ks-input"
              placeholder={t("Shown struck through")}
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
            />
          </Field>
        </div>
        {mrp !== "" && Number(mrp) <= Number(price) && (
          <p className="text-xs" style={{ color: "var(--warn)" }}>{t("MRP should be higher than the selling price to show as a discount.")}</p>
        )}
        <Field label={t("Purchase price (₹, optional)")}>
          <input type="number" className="ks-input" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        </Field>
        <Field label={t("Pieces per pack (optional)")}>
          <input
            type="number"
            min="1"
            className="ks-input"
            placeholder={t("e.g. 20 for a pack of cigarettes")}
            value={packSize}
            onChange={(e) => setPackSize(e.target.value)}
          />
          <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {t("Only if this comes in fixed-count packs — lets Stock in take \"packets × pieces\" instead of a raw count.")}
          </p>
        </Field>
        <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!trackStock}
            onChange={(e) => setTrackStock(!e.target.checked)}
          />
          {t("Made to order (tea, coffee, snacks made fresh when sold) — don't track stock for this item. It'll always be available to bill.")}
        </label>
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleSave} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Save price")}
        </button>
        {onDelete && (
          <button disabled={saving} onClick={handleDelete} className="w-full text-sm py-2.5 rounded-xl font-semibold" style={{ color: "var(--danger)" }}>
            {t("Delete this item")}
          </button>
        )}
      </div>
    </Modal>
  );
}
