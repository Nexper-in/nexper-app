"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

export default function AddDrawModal({ onClose, onAdd }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = Number(amount) > 0;

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      await onAdd(Number(amount), note.trim() || "Personal draw");
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Personal draw from till" onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Amount taken (₹)">
          <input autoFocus type="number" className="ks-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <input className="ks-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Home groceries" />
        </Field>
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleAdd} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Log draw
        </button>
      </div>
    </Modal>
  );
}
