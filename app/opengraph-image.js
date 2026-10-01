import { ImageResponse } from "next/og";

export const alt = "Nexper — Dukaan ka hisaab, ab phone pe";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          color: "#f4f2ff",
          backgroundColor: "#08070f",
          backgroundImage: "radial-gradient(90% 110% at 5% 0%, rgba(124,92,255,0.55) 0%, rgba(8,7,15,0) 60%)",
        }}
      >
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: "-0.04em" }}>
          Ne<span style={{ color: "#f472b6" }}>x</span>per
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 800, lineHeight: 1.05, marginTop: 44, letterSpacing: "-0.03em" }}>
          <span>Dukaan ka hisaab,</span>
          <span style={{ color: "#c084fc" }}>ab phone pe.</span>
        </div>
        <div style={{ fontSize: 32, marginTop: 36, color: "rgba(244,242,255,0.72)" }}>Billing, stock and udhaar for India&apos;s small shops</div>
      </div>
    ),
    size
  );
}
