"use client";

import { useEffect, useState } from "react";

// A QR code drawn in the browser. It used to come from a third-party image
// service, which meant every UPI ID, amount and group link was sent to that
// service. Nothing leaves the device now.
export default function QrImage({ value, size = 156, alt = "QR code", style }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((m) => (m.default || m).toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: "M" }))
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} width={size} height={size} style={style} /> : <div style={{ width: size, height: size, ...style }} />;
}
