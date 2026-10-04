"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { callApi } from "@/lib/apiClient";
import { photoToJpeg } from "@/lib/imageResize";
import { matchItem } from "@/lib/matchItems";
import { useT } from "@/lib/i18n";

// Photo of a customer's written list -> items matched to your stock -> review
// -> added to the bill. Nothing is added until the shopkeeper confirms.
export default function HandwrittenBillModal({ supabase, items, onAdd, onClose }) {
  const t = useT();
  const fileRef = useRef(null);
  const [step, setStep] = useState("capture"); // capture | reading | review
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setStep("reading");
    try {
      const photo = await photoToJpeg(file);
      setPreview(photo.dataUrl);
      const data = await callApi(supabase, "/api/scan-handwritten", { image: photo.base64, mediaType: photo.mediaType });
      setRows(
        data.items.map((l) => {
          const match = matchItem(l.name, items);
          return { ...l, qty: String(l.qty), match, include: Boolean(match) };
        })
      );
      setStep("review");
    } catch (err) {
      setError(err.message || t("Something went wrong. Please try again."));
      setStep("capture");
    }
  }

  function set(i, patch) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const chosen = rows.filter((r) => r.include && r.match && Number(r.qty) > 0);

  return (
    <Modal title={t("Scan a written list")} onClose={onClose}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {step === "capture" && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("Take a photo of the customer's list. Nexper reads it and finds the items in your stock.")}
          </p>
          {error && (
            <p className="text-sm flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          <button onClick={() => fileRef.current?.click()} className="ks-btn-primary w-full flex items-center justify-center gap-2 py-3">
            <Camera size={18} /> {t("Take a photo")}
          </button>
        </div>
      )}

      {step === "reading" && (
        <div className="py-8 flex flex-col items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          <Loader2 size={26} className="animate-spin" />
          {t("Reading the list…")}
        </div>
      )}

      {step === "review" && (
        <div className="space-y-3">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="w-full max-h-32 object-cover rounded-xl" />
          )}
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("Check the items, then add them to the bill.")}</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: "var(--bg-surface-alt)", opacity: r.match ? 1 : 0.7 }}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={r.include && Boolean(r.match)} disabled={!r.match} onChange={(e) => set(i, { include: e.target.checked })} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{r.match ? r.match.name : r.name}</p>
                    <p className="text-[11px]" style={{ color: r.match ? "var(--text-secondary)" : "var(--warn)" }}>
                      {r.match ? t("Written: {name}", { name: r.name }) : t("Not found in your stock")}
                    </p>
                  </div>
                  <input type="number" min="0" inputMode="decimal" className="ks-input ks-mono !w-20 text-center" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} />
                </div>
                {r.match && (
                  <select
                    className="ks-input mt-2 text-sm"
                    value={r.match.id}
                    onChange={(e) => set(i, { match: items.find((it) => it.id === e.target.value) || null })}
                  >
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setStep("capture"); setRows([]); }} className="ks-btn-outline flex items-center gap-1.5 text-sm">
              <RotateCcw size={14} /> {t("Retake")}
            </button>
            <button
              disabled={chosen.length === 0}
              onClick={() => {
                onAdd(chosen.map((r) => ({ item: r.match, qty: Number(r.qty) })));
                onClose();
              }}
              className="ks-btn-primary flex-1 disabled:opacity-40"
            >
              {t("Add {n} to bill", { n: chosen.length })}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
