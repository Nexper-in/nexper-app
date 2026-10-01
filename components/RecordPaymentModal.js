"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import UpiQrCard from "@/components/UpiQrCard";

import { useT } from "@/lib/i18n";
export default function RecordPaymentModal({ customer, upiId, storeName, onClose, onAdd }) {
  const t = useT();
  const [amount, setAmount] = useState(String(customer.balance));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = Number(amount) > 0;

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      await onAdd(Number(amount));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Record payment: {name}", { name: customer.name })} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Amount received (₹)")}>
          <input autoFocus type="number" className="ks-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {upiId && Number(amount) > 0 && <UpiQrCard upiId={upiId} payeeName={storeName} amount={Number(amount)} note={`Udhaar - ${customer.name}`} />}
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleAdd} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Record payment")}
        </button>
      </div>
    </Modal>
  );
}
