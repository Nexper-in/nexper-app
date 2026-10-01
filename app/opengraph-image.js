import { ImageResponse } from "next/og";

export const alt = "Nexper — Your store, in your pocket";
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
          color: "#fff",
          background: "radial-gradient(120% 140% at 12% 0%, #3B1F87 0%, #1B1030 62%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #4F46E5, #129C81 55%, #818CF8)",
            }}
          >
            <div style={{ width: 38, height: 44, background: "#fff", borderRadius: "6px 6px 10px 10px" }} />
          </div>
          <div style={{ fontSize: 56, fontWeight: 800, marginLeft: 24 }}>Nexper</div>
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1, marginTop: 48 }}>Your store, in your pocket.</div>
        <div style={{ fontSize: 32, marginTop: 28, color: "rgba(255,255,255,0.78)" }}>Billing, stock and udhaar. Free to start.</div>
        <div style={{ position: "absolute", bottom: 44, right: 90, fontSize: 30, color: "#E8C468", fontWeight: 700 }}>nexper.in</div>
      </div>
    ),
    size
  );
}
