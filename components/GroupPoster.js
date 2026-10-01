import { upiQrImageUrl } from "@/lib/messaging";

// Counter poster: scan to join the shop's WhatsApp group. Printed in black on
// white (like bills), so it stays outside the Night/Light themes.
export default function GroupPoster({ shopName, groupUrl, headline, sub }) {
  return (
    <div style={{ textAlign: "center", color: "#000", background: "#fff", padding: "48px 32px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 8 }}>{shopName}</div>
      <div style={{ fontSize: 28, fontWeight: 700, margin: "24px 0 8px" }}>{headline}</div>
      <div style={{ fontSize: 18, marginBottom: 28 }}>{sub}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={upiQrImageUrl(groupUrl, 420)} alt="QR" width={420} height={420} style={{ margin: "0 auto" }} />
      <div style={{ fontSize: 14, marginTop: 20, wordBreak: "break-all" }}>{groupUrl}</div>
    </div>
  );
}
