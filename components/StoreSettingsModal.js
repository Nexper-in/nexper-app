"use client";

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { useShop } from "@/components/ShopContext";
import { MODULES } from "@/lib/modules";
import { callApi } from "@/lib/apiClient";

import { useT } from "@/lib/i18n";
export default function StoreSettingsModal({ onClose }) {
  const t = useT();
  const { supabase, activeShop, activeShopId, updateActiveShop, deleteActiveShop, user, updateProfile, showToast } = useShop();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || "");
  const [name, setName] = useState(activeShop?.name || "");
  const [gstin, setGstin] = useState(activeShop?.gstin || "");
  const [upiId, setUpiId] = useState(activeShop?.upi_id || "");
  const [enabledModules, setEnabledModules] = useState(
    activeShop?.enabled_modules || MODULES.map((m) => m.key)
  );
  const [notifyPhone, setNotifyPhone] = useState(activeShop?.notify_phone || "");
  const [summaryOn, setSummaryOn] = useState(!!activeShop?.summary_enabled);
  const [remindersOn, setRemindersOn] = useState(!!activeShop?.reminders_enabled);
  const [everyDays, setEveryDays] = useState(String(activeShop?.reminder_every_days ?? 7));
  const [minAmount, setMinAmount] = useState(String(activeShop?.reminder_min_amount ?? 50));
  const [sendingNow, setSendingNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function sendSummaryNow() {
    setSendingNow(true);
    try {
      const json = await callApi(supabase, "/api/notify/summary-now", { shopId: activeShopId });
      showToast(t("Summary emailed to {email}", { email: json.to }));
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setSendingNow(false);
    }
  }

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
        notify_phone: notifyPhone.replace(/\D/g, "") || null,
        summary_enabled: summaryOn,
        reminders_enabled: remindersOn,
        reminder_every_days: Math.min(60, Math.max(1, Math.round(Number(everyDays)) || 7)),
        reminder_min_amount: Math.max(0, Number(minAmount) || 0),
      });
      showToast(t("Settings saved"));
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
    <Modal title={t("Store settings")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Your name (shown on the dashboard greeting)")}>
          <input className="ks-input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("e.g. Suresh Sharma")} />
        </Field>
        <Field label={t("Store name")}>
          <input className="ks-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("UPI ID (optional — lets customers pay by scanning a QR code)")}>
          <input className="ks-input" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder={t("e.g. shopname@upi")} />
        </Field>
        <Field label={t("GSTIN (optional — shows on printed/WhatsApp bills)")}>
          <input
            className="ks-input ks-mono"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder={t("e.g. 07AAAAA0000A1Z5")}
          />
        </Field>
        <div>
          <span className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>{t("Nightly summary and udhaar reminders")}</span>
          <div className="space-y-2.5">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("Email me a summary every night (9:30 pm)")}</span>
              <input type="checkbox" className="w-5 h-5" checked={summaryOn} onChange={(e) => setSummaryOn(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("Tell me which customers are due an udhaar reminder")}</span>
              <input type="checkbox" className="w-5 h-5" checked={remindersOn} onChange={(e) => setRemindersOn(e.target.checked)} />
            </label>
            {remindersOn && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("Remind every (days)")}>
                  <input className="ks-input ks-mono" type="number" inputMode="numeric" min="1" max="60" value={everyDays} onChange={(e) => setEveryDays(e.target.value)} />
                </Field>
                <Field label={t("Only if they owe at least (₹)")}>
                  <input className="ks-input ks-mono" type="number" inputMode="decimal" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
                </Field>
              </div>
            )}
            <Field label={t("Your WhatsApp number (for the summary, optional)")}>
              <input className="ks-input ks-mono" inputMode="tel" value={notifyPhone} onChange={(e) => setNotifyPhone(e.target.value)} placeholder={t("e.g. 9876543210")} />
            </Field>
            <button type="button" onClick={sendSummaryNow} disabled={sendingNow} className="text-xs font-semibold px-3 py-2 rounded-full flex items-center gap-1.5" style={{ background: "var(--bg-surface-alt)", color: "var(--text-primary)" }}>
              {sendingNow && <Loader2 size={13} className="animate-spin" />}
              {t("Email me today's summary now")}
            </button>
          </div>
        </div>
        <Field label={t("Enabled features for this shop")}>
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
          {t("Save settings")}
        </button>

        <div className="pt-3 mt-1 border-t" style={{ borderColor: "var(--border)" }}>
          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1.5"
            >
              <AlertTriangle size={13} /> {t("Delete this shop")}
            </button>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-[var(--danger)] bg-[var(--danger-soft)] rounded-lg px-3 py-2.5">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  {t("This permanently deletes {name} and everything in it — items, bills, udhaar, day-close history, expenses. This cannot be undone.", { name: activeShop?.name })}
                </span>
              </div>
              <Field label={t("Type \"{name}\" to confirm", { name: activeShop?.name })}>
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
                  {t("Cancel")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!deleteMatches || deleting}
                  className="flex-1 rounded-full text-white text-sm font-semibold py-2.5 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: "var(--danger-solid)" }}
                >
                  {deleting && <Loader2 size={16} className="animate-spin" />}
                  {t("Delete permanently")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
