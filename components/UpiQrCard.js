import { rupee } from "@/lib/format";
import { upiUri, upiQrImageUrl } from "@/lib/messaging";

import { useT } from "@/lib/i18n";
export default function UpiQrCard({ upiId, payeeName, amount, note }) {
  const t = useT();
  if (!upiId) return null;
  const uri = upiUri(upiId, payeeName, amount, note);
  return (
    <div className="rounded-2xl p-4 flex flex-col items-center gap-2" style={{ background: "var(--bg-surface-alt)", border: "1px dashed var(--border-strong)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={upiQrImageUrl(uri)} alt="UPI QR code" width={156} height={156} style={{ borderRadius: 12, background: "#ffffff", padding: 8 }} />
      <p className="text-xs text-[var(--text-secondary)] text-center">
        {t("Scan to pay {amt} via any UPI app", { amt: rupee(amount) })}
      </p>
      <a href={uri} className="text-[11px] font-semibold text-[var(--accent-soft-text)]">
        {t("Open in UPI app instead")}
      </a>
    </div>
  );
}
