"use client";

import { useEffect, useRef } from "react";
import { X, Printer } from "lucide-react";

import { useT } from "@/lib/i18n";
export default function BarcodeModal({ item, onClose }) {
  const t = useT();
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !item) return;
    import("jsbarcode").then(({ default: JsBarcode }) => {
      try {
        JsBarcode(svgRef.current, item.barcode || item.code, {
          format: "CODE128",
          lineColor: "#000000",
          background: "var(--bg-surface)",
          width: 2.5,
          height: 80,
          displayValue: true,
          text: item.name,
          fontSize: 13,
          margin: 14,
          fontOptions: "bold",
        });
      } catch {
        // fallback: if barcode string is invalid for format, use CODE128 with code
        JsBarcode(svgRef.current, item.code, {
          format: "CODE128",
          lineColor: "#000000",
          background: "var(--bg-surface)",
          width: 2.5,
          height: 80,
          displayValue: true,
          text: item.name,
          fontSize: 13,
          margin: 14,
        });
      }
    });
  }, [item]);

  function printBarcode() {
    const svg = svgRef.current?.outerHTML;
    if (!svg) return;
    const win = window.open("", "_blank", "width=400,height=300");
    win.document.write(`<!DOCTYPE html><html><head><title>Barcode – ${item.name}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}svg{max-width:100%}</style></head><body>${svg}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="ks-card p-6 w-full max-w-sm relative" style={{ background: "var(--bg-surface)" }}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
        >
          <X size={15} />
        </button>
        <h2 className="ks-display font-bold mb-1">{item.name}</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-4 ks-mono">
          Code: {item.code}{item.barcode && item.barcode !== item.code ? ` · Barcode: ${item.barcode}` : ""}
        </p>
        <div className="flex justify-center bg-white rounded-xl p-3 border border-[var(--border)] mb-4">
          <svg ref={svgRef} />
        </div>
        <button
          onClick={printBarcode}
          className="ks-btn-outline w-full flex items-center justify-center gap-1.5"
        >
          <Printer size={15} /> {t("Print barcode")}
        </button>
      </div>
    </div>
  );
}
