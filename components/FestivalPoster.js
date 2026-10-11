"use client";

import QrImage from "@/components/QrImage";

// Printable festival offer poster for the shop counter or window.
// Coloured with the festival's theme; print with "background graphics" on.
export default function FestivalPoster({ shopName, emoji, theme, title, details, validText, groupUrl, scanText }) {
  const [a, b] = theme || ["#9a3412", "#f59e0b"];
  return (
    <div style={{ textAlign: "center", color: "#fff", background: `linear-gradient(160deg, ${a}, ${b})`, padding: "56px 36px", fontFamily: "system-ui, sans-serif", minHeight: "100vh", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      <div style={{ fontSize: 96 }}>{emoji}</div>
      <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.15, margin: "16px 0 20px" }}>{title}</div>
      {details && <div style={{ fontSize: 26, lineHeight: 1.4, marginBottom: 20 }}>{details}</div>}
      {validText && <div style={{ fontSize: 22, fontWeight: 700, background: "rgba(0,0,0,.25)", display: "inline-block", padding: "8px 20px", borderRadius: 999 }}>{validText}</div>}
      <div style={{ fontSize: 34, fontWeight: 800, marginTop: 40 }}>{shopName}</div>
      {groupUrl && (
        <div style={{ marginTop: 28 }}>
          <div style={{ background: "#fff", display: "inline-block", padding: 12, borderRadius: 12 }}>
            <QrImage value={groupUrl} size={220} alt="QR" />
          </div>
          <div style={{ fontSize: 18, marginTop: 8 }}>{scanText}</div>
        </div>
      )}
    </div>
  );
}
