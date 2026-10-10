"use client";

import { useMemo, useState } from "react";
import { Upload, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { useT } from "@/lib/i18n";
import { rupee } from "@/lib/format";
import { downloadFile } from "@/lib/gstReport";
import { toCsv } from "@/lib/csv";
import { readStatement, extractCredits, matchCredits, istYmd } from "@/lib/bankRecon";

const WINDOW = 3;
const dayNum = (ymd) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86400000);

// Upload the bank statement CSV, see which UPI/card/bank sales reached the
// bank and which are still missing. The file is read in the browser only.
export default function ReconTab() {
  const t = useT();
  const { supabase, activeShopId, showToast } = useShop();
  const [stmt, setStmt] = useState(null);
  const [cols, setCols] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sales, setSales] = useState(null);

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const s = readStatement(text);
      if (!s.credits.length) { showToast(t("No money-in rows found. Check the columns below."), "err"); }
      setStmt(s);
      setCols(s.cols);
      await loadSales(s.credits.length ? s.credits : []);
    } catch (err) {
      showToast(err.message, "err");
    }
  }

  async function loadSales(credits) {
    setBusy(true);
    const days = credits.map((c) => c.date).sort();
    const from = days[0] || istYmd(new Date());
    const startIso = new Date(`${from}T00:00:00+05:30`);
    startIso.setDate(startIso.getDate() - 1);
    const { data } = await supabase
      .from("bills").select("id, bill_no, total, date, payment_method, payment_type")
      .eq("shop_id", activeShopId).neq("payment_type", "credit").neq("payment_method", "cash")
      .gte("date", startIso.toISOString()).order("date");
    setSales((data || []).map((b) => ({ id: b.id, date: b.date, amount: Number(b.total), label: `#${b.bill_no} ${String(b.payment_method).toUpperCase()}` })));
    setBusy(false);
  }

  const credits = useMemo(() => (stmt && cols ? extractCredits(stmt.rows, cols) : []), [stmt, cols]);
  const result = useMemo(() => {
    if (!sales || !credits.length) return null;
    const last = credits.map((c) => c.date).sort().pop();
    const first = credits.map((c) => c.date).sort()[0];
    // Sales inside the statement window only; very recent ones may not have settled yet.
    const inRange = sales.filter((s) => istYmd(s.date) >= first && istYmd(s.date) <= last);
    const pending = inRange.filter((s) => dayNum(last) - dayNum(istYmd(s.date)) < WINDOW);
    const checked = inRange.filter((s) => !pending.includes(s));
    const r = matchCredits(checked, credits.filter((c) => c.date >= first), { windowDays: WINDOW });
    return { ...r, pending };
  }, [sales, credits]);

  function exportMismatches() {
    const rows = [
      ...result.unmatchedSales.map((s) => ["Sale not in bank", istYmd(s.date), s.amount, s.label]),
      ...result.unmatchedCredits.map((c) => ["Bank credit with no sale", c.date, c.amount, c.desc]),
    ];
    downloadFile("upi-mismatches.csv", toCsv(["Type", "Date", "Amount", "Detail"], rows), "text/csv");
  }

  const head = stmt?.rows[stmt.cols.headerRow] || [];
  const colSelect = (key, label) => (
    <label className="text-xs block">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <select className="ks-input mt-1" value={cols[key]} onChange={(e) => setCols({ ...cols, [key]: Number(e.target.value) })}>
        <option value={-1}>—</option>
        {head.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="ks-card p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("Upload your bank statement (CSV) to check that every UPI, card and bank sale reached your account. The file stays on this device and is not uploaded.")}
      </div>
      <label className="ks-btn-primary inline-flex items-center gap-2 cursor-pointer">
        <Upload size={16} /> {t("Choose statement CSV")}
        <input type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={onFile} />
      </label>

      {stmt && cols && (
        <div className="ks-card p-4 space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">{t("We guessed these columns. Change them if the numbers look wrong.")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {colSelect("date", t("Date"))}
            {colSelect("credit", t("Money in (credit)"))}
            {colSelect("desc", t("Description"))}
          </div>
        </div>
      )}

      {busy && <p className="text-sm text-muted">{t("Checking…")}</p>}

      {result && !busy && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              [t("Sales checked"), result.totals.sales, null],
              [t("Matched"), result.totals.matched, "var(--ok, #16a34a)"],
              [t("Not in bank"), result.totals.missing, result.totals.missing > 0 ? "var(--danger)" : null],
              [t("Extra in bank"), result.totals.extra, null],
            ].map(([label, v, color]) => (
              <div key={label} className="ks-card p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">{label}</p>
                <p className="ks-display font-bold mt-1" style={color ? { color } : undefined}>{rupee(v)}</p>
              </div>
            ))}
          </div>
          {result.pending.length > 0 && (
            <p className="text-xs text-[var(--text-secondary)]">{t("{n} sales from the last few days are not counted yet, because the bank may still be settling them.", { n: result.pending.length })}</p>
          )}
          {result.unmatchedSales.length === 0 && result.unmatchedCredits.length === 0 ? (
            <p className="flex items-center gap-2 text-sm" style={{ color: "var(--ok, #16a34a)" }}><CheckCircle2 size={16} /> {t("Everything matches.")}</p>
          ) : (
            <>
              {result.unmatchedSales.length > 0 && (
                <div className="ks-card p-4">
                  <p className="font-semibold text-sm flex items-center gap-2 mb-2"><AlertTriangle size={14} style={{ color: "var(--warn)" }} /> {t("Sales not found in the bank")}</p>
                  {result.unmatchedSales.map((s) => (
                    <div key={s.id} className="flex justify-between text-sm py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <span>{istYmd(s.date)} · {s.label}</span><span className="ks-mono">{rupee(s.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.unmatchedCredits.length > 0 && (
                <div className="ks-card p-4">
                  <p className="font-semibold text-sm mb-2">{t("Money in the bank with no matching sale")}</p>
                  {result.unmatchedCredits.map((c) => (
                    <div key={c.id} className="flex justify-between gap-3 text-sm py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <span className="truncate">{c.date} · {c.desc}</span><span className="ks-mono shrink-0">{rupee(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={exportMismatches} className="ks-btn-outline inline-flex items-center gap-2 text-sm"><Download size={14} /> {t("Download mismatches (CSV)")}</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
