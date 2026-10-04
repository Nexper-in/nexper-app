"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { MODULES, defaultPermissions } from "@/lib/modules";

import { useT } from "@/lib/i18n";
export default function AddStaffModal({ onClose, onAdd }) {
  const t = useT();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [permissions, setPermissions] = useState(defaultPermissions(false));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pinTooShort = pin.length > 0 && pin.length < 6;
  const valid = name.trim() && /^\d{6,}$/.test(pin);

  function togglePermission(key) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      await onAdd({ name: name.trim(), pin, permissions });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Add staff member")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Worker's name")}>
          <input className="ks-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Ramesh")} />
        </Field>
        <Field label={t("PIN (6+ digits — this is their login password)")}>
          <input
            className="ks-input ks-mono"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 483920"
          />
          {pinTooShort && (
            <p className="text-xs text-[var(--danger)] font-medium mt-1">{t("{n} more digits needed", { n: 6 - pin.length })}</p>
          )}
        </Field>
        <Field label={t("What can they access?")}>
          <div className="grid grid-cols-2 gap-2">
            {MODULES.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-colors"
                style={
                  permissions[m.key]
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }
                    : { borderColor: "var(--border)", color: "var(--text-secondary)" }
                }
              >
                <input type="checkbox" className="hidden" checked={!!permissions[m.key]} onChange={() => togglePermission(m.key)} />
                {m.label}
              </label>
            ))}
          </div>
        </Field>
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleAdd} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Add staff member")}
        </button>
      </div>
    </Modal>
  );
}
