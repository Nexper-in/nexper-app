"use client";

import { rupee } from "@/lib/format";
import { upiUri } from "@/lib/messaging";
import QrImage from "@/components/QrImage";

import { useT } from "@/lib/i18n";
export default function UpiQrCard({ upiId, payeeName, amount, note }) {
  const t = useT();
  if (!upiId) return null;
  const uri = upiUri(upiId, payeeName, amount, note);
  return (
    <div className="rounded-2xl p-4 flex flex-col items-center gap-2" style={{ background: "var(--bg-surface-alt)", border: "1px dashed var(--border-strong)" }}>
      <QrImage value={uri} size={156} alt="UPI QR code" style={{ borderRadius: 12, background: "#ffffff", padding: 8 }} />
      <p className="text-xs text-[var(--text-secondary)] text-center">
        {t("Scan to pay {amt} via any UPI app", { amt: rupee(amount) })}
      </p>
      <a href={uri} className="text-[11px] font-semibold text-[var(--accent-soft-text)]">
        {t("Open in UPI app instead")}
      </a>
    </div>
  );
}
