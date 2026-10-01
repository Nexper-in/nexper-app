"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

const MODE_INFO = {
  purchase: {
    title: (name) => `Log purchase — ${name}`,
    label: "Value of goods received (₹)",
    hint: "Goods received on credit — this adds to what you owe. No cash moves.",
    button: "Log purchase",
    color: "var(--accent-soft-text)",
  },
  payment: {
    title: (name) => `Record payment — ${name}`,
    label: "Amount paid (₹)",
    hint: "This logs a cash-out expense and reduces the balance owed.",
    button: "Record payment",
    color: "var(--success)",
  },
  debit: {
    title: (name) => `Return / debit note — ${name}`,
    label: "Value of returned / rejected stock (₹)",
    hint: "Reduces what you owe this vendor — no cash movement.",
    button: "Log debit note",
    color: "var(--danger)",
  },
};

export default function SupplierAmountModal({ mode, supplier, onClose, onConfirm }) {
  const info = MODE_INFO[mode];
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = Number(amount) > 0;

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm(Number(amount));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={info.title(supplier.name)} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={info.label}>
          <input autoFocus type="number" min="0" className="ks-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <p className="text-xs text-[var(--text-secondary)]">{info.hint}</p>
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button
          disabled={!valid || saving}
          onClick={handleConfirm}
          className="w-full rounded-full text-white text-sm font-semibold py-2.5 disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: info.color }}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {info.button}
        </button>
      </div>
    </Modal>
  );
}
