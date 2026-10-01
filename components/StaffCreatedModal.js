"use client";

import { CheckCircle2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

// Shown once, right after a staff member is created — the PIN is never
// retrievable again after this (Supabase only stores it hashed), so the
// owner needs to note it down or share it with the worker now.
export default function StaffCreatedModal({ name, staffCode, pin, onClose }) {
  return (
    <Modal title="Staff member added" onClose={onClose}>
      <div className="space-y-4 text-center">
        <CheckCircle2 size={40} className="mx-auto text-[var(--accent-soft-text)]" />
        <p className="text-sm text-[var(--text-secondary)]">
          Share these with <span className="font-semibold text-[var(--text-primary)]">{name}</span> so they can sign in from the login
          screen&apos;s &quot;Staff sign in&quot; tab. The PIN won&apos;t be shown again after you close this.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="ks-card p-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold mb-1">Staff code</div>
            <div className="ks-mono text-lg font-bold">{staffCode}</div>
          </div>
          <div className="ks-card p-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold mb-1">PIN</div>
            <div className="ks-mono text-lg font-bold">{pin}</div>
          </div>
        </div>
        <button onClick={onClose} className="ks-btn-primary w-full">
          Done
        </button>
      </div>
    </Modal>
  );
}
