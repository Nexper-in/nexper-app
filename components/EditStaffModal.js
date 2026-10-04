"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { MODULES } from "@/lib/modules";

import { useT } from "@/lib/i18n";
export default function EditStaffModal({ member, onClose, onSave }) {
  const t = useT();
  const [name, setName] = useState(member.name);
  const [permissions, setPermissions] = useState(member.permissions || {});
  const [resetPin, setResetPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pinTooShort = resetPin && newPin.length > 0 && newPin.length < 6;
  const valid = name.trim() && (!resetPin || /^\d{6,}$/.test(newPin));

  function togglePermission(key) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), permissions, newPin: resetPin ? newPin : undefined });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Edit {name}", { name: member.name })} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Worker's name")}>
          <input className="ks-input" value={name} onChange={(e) => setName(e.target.value)} />
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
        {!resetPin ? (
          <button type="button" onClick={() => setResetPin(true)} className="text-xs font-semibold text-[var(--accent-soft-text)]">
            {t("Reset their PIN")}
          </button>
        ) : (
          <Field label={t("New PIN (6+ digits)")}>
            <input
              className="ks-input ks-mono"
              inputMode="numeric"
              autoFocus
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 583920"
            />
            {pinTooShort && (
              <p className="text-xs text-[var(--danger)] font-medium mt-1">
                {t("{n} more digits needed", { n: 6 - newPin.length })}
              </p>
            )}
          </Field>
        )}
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button disabled={!valid || saving} onClick={handleSave} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Save changes")}
        </button>
      </div>
    </Modal>
  );
}
