"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { useT } from "@/lib/i18n";

// Shared between the Play area screen and the "Play area" picker on New bill
// (see app/(app)/billing/BillingParts.js), so a station added or edited from
// either place looks and behaves the same.

export function clock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function StationModal({ station, types, onSave, onClose }) {
  const t = useT();
  const [name, setName] = useState(station?.name || "");
  const [type, setType] = useState(station?.type || "carrom");
  const [rate, setRate] = useState(station ? String(station.hourly_rate) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(fields) {
    setSaving(true);
    setError("");
    try {
      await onSave(fields);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const rateNum = parseFloat(rate);
  const valid = name.trim().length > 0 && rateNum >= 0 && rateNum <= 100000;

  return (
    <Modal title={station ? t("Edit station") : t("Add station")} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label={t("Station name")}>
          <input autoFocus className="ks-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Carrom Table 1")} />
        </Field>
        <Field label={t("Station type")}>
          <select className="ks-input" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((ty) => (
              <option key={ty.id} value={ty.id}>{t(ty.label)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("Rate per hour (₹)")}>
          <input className="ks-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="50" />
        </Field>
        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
        <button
          disabled={!valid || saving}
          onClick={() => submit({ name: name.trim(), type, hourly_rate: Math.round(rateNum * 100) / 100 })}
          className="ks-btn-primary w-full flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t("Save")}
        </button>
        {station && (
          <button disabled={saving} onClick={() => submit({ active: !station.active })} className="ks-btn-outline w-full text-sm">
            {station.active ? t("Hide this station") : t("Show this station again")}
          </button>
        )}
      </div>
    </Modal>
  );
}
