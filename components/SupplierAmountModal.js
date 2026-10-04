"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

import { T, useT } from "@/lib/i18n";
const MODE_INFO = {
  purchase: {
    title: T("Log purchase — {name}"),
    label: T("Value of goods received (₹)"),
    hint: T("Goods received on credit — this adds to what you owe. No cash moves."),
    button: T("Log purchase"),
    color: "var(--accent-soft-text)",
  },
  payment: {
    title: T("Record payment — {name}"),
    label: T("Amount paid (₹)"),
    hint: T("This logs a cash-out expense and reduces the balance owed."),
    button: T("Record payment"),
    color: "var(--success)",
  },
  debit: {
    title: T("Return / debit note — {name}"),
    label: T("Value of returned / rejected stock (₹)"),
    hint: T("Reduces what you owe this vendor — no cash movement."),
    button: T("Log debit note"),
    color: "var(--danger)",
  },
};

export default function SupplierAmountModal({ mode, supplier, onClose, onConfirm }) {
  const t = useT();
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
    <Modal title={t(info.title, { name: supplier.name })} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t(info.label)}>
          <input autoFocus type="number" min="0" className="ks-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <p className="text-xs text-[var(--text-secondary)]">{t(info.hint)}</p>
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button
          disabled={!valid || saving}
          onClick={handleConfirm}
          className="w-full rounded-full text-white text-sm font-semibold py-2.5 disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: info.color }}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t(info.button)}
        </button>
      </div>
    </Modal>
  );
}
