"use client";

import { useRef, useState } from "react";
import { Download, Loader2, CheckCircle2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useShop } from "@/components/ShopContext";
import { useT } from "@/lib/i18n";
import { buildExport, exportFileName } from "@/lib/exportData";

// Owner-only "Download my data": every list in the shop as a zip of spreadsheet
// files. Built in the browser from the owner's own session, so nothing is
// stored on a server and nobody else's data can end up in it.
export default function ExportDataModal({ onClose }) {
  const t = useT();
  const { supabase, activeShop } = useShop();
  const [state, setState] = useState("idle"); // idle | working | done | error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const blobRef = useRef(null);

  function save() {
    if (!blobRef.current) return;
    const url = URL.createObjectURL(blobRef.current);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(activeShop);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function start() {
    setState("working");
    setError("");
    setProgress(0);
    try {
      const { files, counts } = await buildExport(supabase, activeShop, { onProgress: (n, total) => setProgress(Math.round((n / total) * 100)) });
      const { zipSync, strToU8 } = await import("fflate");
      const entries = {};
      for (const [name, text] of Object.entries(files)) entries[name] = strToU8(text);
      blobRef.current = new Blob([zipSync(entries, { level: 6 })], { type: "application/zip" });
      setSummary(counts.filter(([f]) => ["bills", "udhaar_entries", "items", "expenses"].includes(f)));
      setState("done");
      save();
    } catch (e) {
      setError(e.message || t("Something went wrong. Try again."));
      setState("error");
    }
  }

  return (
    <Modal title={t("Download my data")} onClose={state === "working" ? undefined : onClose}>
      <div className="space-y-3.5 text-sm">
        <p className="text-[var(--text-secondary)]">
          {t("Get every list from your shop (bills, udhaar, items, expenses and more) as spreadsheet files you can open in Excel. Sign-in details are never included.")}
        </p>

        {state === "working" && (
          <div>
            <div className="h-2 rounded-full bg-[var(--bg-surface-alt)] overflow-hidden">
              <div className="h-full" style={{ width: `${progress}%`, background: "var(--grad)", transition: "width .2s" }} />
            </div>
            <p className="mt-2 text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> {t("Collecting your data… this can take a minute for a busy shop.")}
            </p>
          </div>
        )}

        {state === "done" && (
          <div className="rounded-xl p-3" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
            <p className="font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={15} /> {t("Your file is ready.")}
            </p>
            {summary && (
              <p className="mt-1 text-xs">
                {summary.map(([f, n]) => `${f.replace(/_/g, " ")}: ${n}`).join(" · ")}
              </p>
            )}
          </div>
        )}

        {state === "error" && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>
        )}

        {state === "done" ? (
          <button type="button" onClick={save} className="ks-btn-primary w-full flex items-center justify-center gap-2">
            <Download size={16} /> {t("Download again")}
          </button>
        ) : (
          <button type="button" onClick={start} disabled={state === "working"} className="ks-btn-primary w-full flex items-center justify-center gap-2">
            {state === "working" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {t("Download my data")}
          </button>
        )}
      </div>
    </Modal>
  );
}
