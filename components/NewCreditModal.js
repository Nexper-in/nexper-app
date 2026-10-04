"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

import { useT } from "@/lib/i18n";
export default function NewCreditModal({ onClose, onAdd }) {
  const t = useT();
  const [form, setForm] = useState({ name: "", phone: "", amount: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = form.name.trim() && /^\d{10}$/.test(form.phone.replace(/\D/g, "")) && Number(form.amount) > 0;

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      await onAdd({
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        amount: Number(form.amount),
        note: form.note.trim() || "Credit sale",
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("New credit (udhaar) entry")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Customer name")}>
          <input className="ks-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t("Phone number")}>
          <input className="ks-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={t("Amount (₹)")}>
          <input type="number" className="ks-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label={t("Note (optional)")}>
          <input
            className="ks-input"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={t("e.g. Groceries for the week")}
          />
        </Field>
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleAdd} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Add entry")}
        </button>
      </div>
    </Modal>
  );
}
