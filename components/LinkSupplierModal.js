"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

import { useT } from "@/lib/i18n";
// Lets an owner attach a supplier already created for one of their other
// shops to the current shop, instead of re-creating it — this is the
// actual payoff of suppliers being owner-level master data.
export default function LinkSupplierModal({ availableSuppliers, onClose, onLink }) {
  const t = useT();
  const [linkingId, setLinkingId] = useState(null);

  async function handleLink(supplier) {
    setLinkingId(supplier.id);
    try {
      await onLink(supplier);
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <Modal title={t("Link an existing supplier")} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-secondary)]">
          {t("These suppliers are already in your account from other shops — link one here instead of re-adding it.")}
        </p>
        <div className="max-h-80 overflow-y-auto ks-scroll space-y-2 pr-1">
          {availableSuppliers.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)] text-center py-6">
              {t("No other suppliers on your account yet — use \"Add supplier\" to create one.")}
            </p>
          )}
          {availableSuppliers.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm py-1.5">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">{s.phone || "—"}{s.items ? ` · ${s.items}` : ""}</div>
              </div>
              <button
                onClick={() => handleLink(s)}
                disabled={linkingId === s.id}
                className="text-xs px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1 shrink-0"
                style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}
              >
                {linkingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                {t("Link")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
