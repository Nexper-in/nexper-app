"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Staff salary",
  "Transport",
  "Maintenance",
  "Subscription",
  "Loan/EMI",
  "Other",
];

export default function AddExpenseModal({ onClose, onAdd }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = Number(amount) > 0;

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      await onAdd({ category, amount: Number(amount), note: note.trim() || null });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Log an expense" onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Category">
          <select className="ks-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₹)">
          <input autoFocus type="number" className="ks-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <input className="ks-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. June electricity bill" />
        </Field>
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleAdd} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Log expense
        </button>
      </div>
    </Modal>
  );
}
