"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

export default function CreatePOModal({ items, suppliers, onClose, onCreate }) {
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ shop_product_id: "", item_name: "", qty: 1, unit_price: "", unit: "pcs" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function pickSupplier(id) {
    setSupplierId(id);
    const s = suppliers.find((s) => s.id === id);
    setSupplierName(s?.name || "");
  }

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "shop_product_id") {
        const item = items.find((it) => it.id === value);
        if (item) {
          updated.item_name = item.name;
          updated.unit = item.unit || "pcs";
          updated.unit_price = item.cost_price ?? "";
        }
      }
      return updated;
    }));
  }

  function addLine() {
    setLines((prev) => [...prev, { shop_product_id: "", item_name: "", qty: 1, unit_price: "", unit: "pcs" }]);
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const valid = lines.some((l) => l.item_name.trim()) && (supplierId || supplierName.trim());

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      await onCreate({
        supplier_id: supplierId || null,
        supplier_name: supplierName.trim(),
        expected_date: expectedDate || null,
        notes: notes.trim() || null,
        lines: lines.filter((l) => l.item_name.trim()).map((l) => ({
          shop_product_id: l.shop_product_id || null,
          item_name: l.item_name.trim(),
          item_code: items.find((it) => it.id === l.shop_product_id)?.code || null,
          qty: Number(l.qty) || 1,
          unit_price: l.unit_price !== "" ? Number(l.unit_price) : null,
          unit: l.unit || "pcs",
        })),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="New purchase order" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            {suppliers.length > 0 ? (
              <select className="ks-input" value={supplierId} onChange={(e) => pickSupplier(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <input
                className="ks-input"
                placeholder="Supplier name"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            )}
          </Field>
          <Field label="Expected delivery">
            <input type="date" className="ks-input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">Items to order</p>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="grid gap-2" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
                <select
                  className="ks-input text-sm"
                  value={line.shop_product_id}
                  onChange={(e) => updateLine(idx, "shop_product_id", e.target.value)}
                >
                  <option value="">Select item</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
                <input
                  type="number"
                  min="1"
                  className="ks-input ks-mono w-20 text-center"
                  placeholder="Qty"
                  value={line.qty}
                  onChange={(e) => updateLine(idx, "qty", e.target.value)}
                />
                <input
                  type="number"
                  className="ks-input ks-mono w-24"
                  placeholder="₹/unit"
                  value={line.unit_price}
                  onChange={(e) => updateLine(idx, "unit_price", e.target.value)}
                />
                <button
                  onClick={() => removeLine(idx)}
                  disabled={lines.length === 1}
                  className="w-8 h-10 flex items-center justify-center rounded-xl disabled:opacity-30"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addLine} className="mt-2 text-xs font-semibold flex items-center gap-1" style={{ color: "var(--accent-soft-text)" }}>
            <Plus size={13} /> Add item
          </button>
        </div>

        <Field label="Notes (optional)">
          <textarea className="ks-input resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for this order…" />
        </Field>

        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button disabled={!valid || saving} onClick={handleCreate} className="ks-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Create purchase order
        </button>
      </div>
    </Modal>
  );
}
