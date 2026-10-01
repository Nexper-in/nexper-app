"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

export default function EditPriceModal({ item, onClose, onSave }) {
  const [price, setPrice] = useState(String(item.price ?? ""));
  const [mrp, setMrp] = useState(item.mrp != null ? String(item.mrp) : "");
  const [costPrice, setCostPrice] = useState(item.cost_price != null ? String(item.cost_price) : "");
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
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit price: ${item.name}`} onClose={onClose}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Selling price (₹)">
            <input autoFocus type="number" className="ks-input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="MRP (₹, optional)">
            <input
              type="number"
              className="ks-input"
              placeholder="Shown struck through"
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
            />
          </Field>
        </div>
        {mrp !== "" && Number(mrp) <= Number(price) && (
          <p className="text-xs" style={{ color: "var(--warn)" }}>MRP should be higher than the selling price to show as a discount.</p>
        )}
        <Field label="Purchase price (₹, optional)">
          <input type="number" className="ks-input" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        </Field>
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleSave} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Save price
        </button>
      </div>
    </Modal>
  );
}
