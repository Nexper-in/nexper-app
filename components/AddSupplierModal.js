"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

import { useT } from "@/lib/i18n";
export default function AddSupplierModal({ onClose, onAdd }) {
  const t = useT();
  const [form, setForm] = useState({ name: "", phone: "", items: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = form.name.trim();

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      await onAdd({ name: form.name.trim(), phone: form.phone.replace(/\D/g, "") || null, items: form.items.trim() || null });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Add supplier")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Supplier / business name")}>
          <input className="ks-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t("Phone (optional)")}>
          <input
            className="ks-input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder={t("10-digit mobile number")}
          />
        </Field>
        <Field label={t("What they supply (optional)")}>
          <input className="ks-input" value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} placeholder={t("e.g. Rice, dal, oil")} />
        </Field>
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleAdd} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Add supplier")}
        </button>
      </div>
    </Modal>
  );
}
