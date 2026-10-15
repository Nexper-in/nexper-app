"use client";

import { useEffect, useMemo, useState } from "react";
import { callApi } from "@/lib/apiClient";
import { Page, Loading, MigrationNotice, DANGER_TEXT } from "./shared";

const COLS = [
  ["org_name", "Company"],
  ["shops", "Shops"],
  ["active_shops", "Billing this month"],
  ["bills_month", "Bills (month)"],
  ["bills_total", "Bills (all time)"],
  ["ai_scans_month", "AI scans"],
  ["api_keys", "API keys"],
  ["est_storage_mb", "Storage (estimate, MB)"],
];

// Usage per company for a month. The storage figure is an estimate (bills and stock movements only).
export default function UsageTab({ supabase }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ key: "bills_month", dir: -1 });

  useEffect(() => {
    setData(null);
    callApi(supabase, `/api/admin/usage?month=${month}`, null, "GET").then(setData).catch((e) => setError(e.message));
  }, [supabase, month]);

  const rows = useMemo(() => {
    const list = [...(data?.companies || [])];
    list.sort((a, b) => {
      const x = sort.key === "org_name" ? a.org_name : Number(a[sort.key]);
      const y = sort.key === "org_name" ? b.org_name : Number(b[sort.key]);
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
    return list;
  }, [data, sort]);

  if (error) return <p className="text-sm" style={{ color: DANGER_TEXT }}>{error}</p>;
  return (
    <Page title="Usage" subtitle="What each company used: the basis for pricing, and for spotting a heavy one. Storage is a rough estimate from bills and stock movements.">
      <MigrationNotice show={data?.needsMigration} />
      <input type="month" className="ks-input max-w-[12rem]" value={month} onChange={(e) => setMonth(e.target.value)} />
      {!data ? (
        <Loading />
      ) : (
        <div className="ks-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                {COLS.map(([key, label]) => (
                  <th key={key} className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}>
                    {label}{sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.org_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  {COLS.map(([key]) => (
                    <td key={key} className="px-4 py-3">{key === "est_storage_mb" ? Number(r[key]).toFixed(2) : r[key]}</td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={COLS.length} className="px-4 py-6 text-center" style={{ color: "var(--text-secondary)" }}>No companies.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
