"use client";

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { useShop } from "@/components/ShopContext";
import { MODULES } from "@/lib/modules";

export default function StoreSettingsModal({ onClose }) {
  const { activeShop, updateActiveShop, deleteActiveShop, user, updateProfile, showToast } = useShop();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || "");
  const [name, setName] = useState(activeShop?.name || "");
  const [gstin, setGstin] = useState(activeShop?.gstin || "");
  const [upiId, setUpiId] = useState(activeShop?.upi_id || "");
  const [enabledModules, setEnabledModules] = useState(
    activeShop?.enabled_modules || MODULES.map((m) => m.key)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleModule(key) {
    setEnabledModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteMatches = confirmText.trim() === activeShop?.name;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (fullName.trim() !== (user?.user_metadata?.full_name || "")) {
        await updateProfile({ full_name: fullName.trim() });
      }
      await updateActiveShop({
        name: name.trim() || activeShop.name,
        gstin: gstin.trim() || null,
        upi_id: upiId.trim() || null,
        enabled_modules: enabledModules,
      });
      showToast("Settings saved");
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteActiveShop();
      showToast(`${activeShop.name} deleted`);
      onClose();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  return (
    <Modal title="Store settings" onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Your name (shown on the dashboard greeting)">
          <input className="ks-input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Suresh Sharma" />
        </Field>
        <Field label="Store name">
          <input className="ks-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="UPI ID (optional — lets customers pay by scanning a QR code)">
          <input className="ks-input" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. shopname@upi" />
        </Field>
        <Field label="GSTIN (optional — shows on printed/WhatsApp bills)">
          <input
            className="ks-input ks-mono"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="e.g. 07AAAAA0000A1Z5"
          />
        </Field>
        <Field label="Enabled features for this shop">
          <div className="grid grid-cols-2 gap-2">
            {MODULES.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-colors"
                style={
                  enabledModules.includes(m.key)
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }
                    : { borderColor: "var(--border)", color: "var(--text-secondary)" }
                }
              >
                <input type="checkbox" className="hidden" checked={enabledModules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                {m.label}
              </label>
            ))}
          </div>
        </Field>
        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}
        <button onClick={handleSave} disabled={saving} className="ks-btn-primary w-full flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Save settings
        </button>

        <div className="pt-3 mt-1 border-t" style={{ borderColor: "var(--border)" }}>
          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1.5"
            >
              <AlertTriangle size={13} /> Delete this shop
            </button>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-[var(--danger)] bg-[var(--danger-soft)] rounded-lg px-3 py-2.5">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  This permanently deletes <strong>{activeShop?.name}</strong> and everything in it — items, bills,
                  udhaar, day-close history, expenses. This cannot be undone.
                </span>
              </div>
              <Field label={`Type "${activeShop?.name}" to confirm`}>
                <input className="ks-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              </Field>
              {deleteError && (
                <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowDelete(false);
                    setConfirmText("");
                    setDeleteError("");
                  }}
                  className="ks-btn-outline flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!deleteMatches || deleting}
                  className="flex-1 rounded-full text-white text-sm font-semibold py-2.5 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: "var(--danger-solid)" }}
                >
                  {deleting && <Loader2 size={16} className="animate-spin" />}
                  Delete permanently
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
