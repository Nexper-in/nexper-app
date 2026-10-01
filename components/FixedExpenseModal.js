"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { EXPENSE_CATEGORIES } from "@/components/AddExpenseModal";

export default function FixedExpenseModal({ editing, onClose, onSave }) {
  const [name, setName] = useState(editing?.name || "");
  const [category, setCategory] = useState(editing?.category || EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [dueDay, setDueDay] = useState(editing?.due_day ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = name.trim() && Number(amount) > 0 && Number(dueDay) >= 1 && Number(dueDay) <= 28;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), category, amount: Number(amount), due_day: Number(dueDay) });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "Edit fixed expense" : "Add fixed expense"} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Expense name">
          <input autoFocus className="ks-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shop Rent" />
        </Field>
        <Field label="Category">
          <select className="ks-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹/month)">
            <input type="number" min="0" className="ks-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Due day of month">
            <input
              type="number"
              min="1"
              max="28"
              className="ks-input"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="1"
            />
          </Field>
        </div>
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button disabled={!valid || saving} onClick={handleSave} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {editing ? "Save changes" : "Add fixed expense"}
        </button>
      </div>
    </Modal>
  );
}
