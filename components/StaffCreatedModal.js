"use client";

import { CheckCircle2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

import { useT } from "@/lib/i18n";
// Shown once, right after a staff member is created — the PIN is never
// retrievable again after this (Supabase only stores it hashed), so the
// owner needs to note it down or share it with the worker now.
export default function StaffCreatedModal({ name, staffCode, pin, onClose }) {
  const t = useT();
  return (
    <Modal title={t("Staff member added")} onClose={onClose}>
      <div className="space-y-4 text-center">
        <CheckCircle2 size={40} className="mx-auto text-[var(--accent-soft-text)]" />
        <p className="text-sm text-[var(--text-secondary)]">
          {t("Share these with {name} so they can sign in from the login screen's \"Staff sign in\" tab. The PIN won't be shown again after you close this.", { name })}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="ks-card p-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold mb-1">{t("Staff code")}</div>
            <div className="ks-mono text-lg font-bold">{staffCode}</div>
          </div>
          <div className="ks-card p-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold mb-1">{t("PIN")}</div>
            <div className="ks-mono text-lg font-bold">{pin}</div>
          </div>
        </div>
        <button onClick={onClose} className="ks-btn-primary w-full">
          {t("Done")}
        </button>
      </div>
    </Modal>
  );
}
