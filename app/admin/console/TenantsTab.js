"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { callApi } from "@/lib/apiClient";
import Modal from "@/components/ui/Modal";
import { FEATURES } from "@/lib/platformDefaults";
import { Page, Field, Toggle, SaveButton, Loading, MigrationNotice, fmtDate } from "./shared";

export default function TenantsTab({ supabase }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await callApi(supabase, "/api/admin/tenant-controls", null, "GET"));
    } catch (err) {
      setError(err.message);
    }
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm" style={{ color: "#F29C9C" }}>{error}</p>;
  if (!data) return <Loading />;
  const rows = data.tenants.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page title="Tenants" subtitle="Each shop's plan, limits, feature overrides and API access.">
      <MigrationNotice show={data.needsMigration} />
      <input className="ks-input max-w-xs" placeholder="Search shops" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ks-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              {["Shop", "Plan", "Plan ends", "AI scans (month)", "API / MCP", "Keys", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const plan = t.controls?.plan || t.plan || "free";
              return (
                <tr key={t.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3"><div className="font-semibold">{t.name}</div><div className="text-xs" style={{ color: "var(--text-secondary)" }}>{t.type} · since {fmtDate(t.created_at)}</div></td>
                  <td className="px-4 py-3"><span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={plan === "pro" ? { background: "var(--gold-soft)", color: "var(--gold)" } : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}>{plan}</span>{t.controls?.plan && <span className="text-[10px] ml-1" style={{ color: "var(--text-secondary)" }}>set by admin</span>}</td>
                  <td className="px-4 py-3">{fmtDate(t.controls?.plan_expires_at)}</td>
                  <td className="px-4 py-3">{t.ai_scans_this_month}{typeof t.controls?.limits?.aiScansPerMonth === "number" ? ` / ${t.controls.limits.aiScansPerMonth}` : ""}</td>
                  <td className="px-4 py-3 text-xs">{t.controls?.api_enabled ? "API " : ""}{t.controls?.mcp_enabled ? "MCP" : ""}{!t.controls?.api_enabled && !t.controls?.mcp_enabled ? "—" : ""}</td>
                  <td className="px-4 py-3">{t.api_keys}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => setEdit(t)} className="ks-btn-outline !py-1.5 text-xs flex items-center gap-1.5"><Settings2 size={13} /> Manage</button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center" style={{ color: "var(--text-secondary)" }}>No shops.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <TenantControlsModal tenant={edit} supabase={supabase} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </Page>
  );
}

function TenantControlsModal({ tenant, supabase, onClose, onSaved }) {
  const c = tenant.controls || {};
  const [plan, setPlan] = useState(c.plan || "");
  const [ends, setEnds] = useState(c.plan_expires_at ? c.plan_expires_at.slice(0, 10) : "");
  const [maxStaff, setMaxStaff] = useState(c.limits?.maxStaff ?? "");
  const [scans, setScans] = useState(c.limits?.aiScansPerMonth ?? "");
  const [overrides, setOverrides] = useState(c.feature_overrides || {});
  const [api, setApi] = useState(Boolean(c.api_enabled));
  const [mcp, setMcp] = useState(Boolean(c.mcp_enabled));
  const [notes, setNotes] = useState(c.notes || "");

  const cycle = (key) =>
    setOverrides((o) => {
      const cur = o[key];
      const next = cur === undefined ? true : cur === true ? false : undefined;
      const out = { ...o };
      if (next === undefined) delete out[key];
      else out[key] = next;
      return out;
    });

  return (
    <Modal title={`Manage ${tenant.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan">
            <select className="ks-input" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">Follow the shop's own ({tenant.plan || "free"})</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
          </Field>
          <Field label="Plan ends (optional)" hint="After this date the shop drops to Free.">
            <input className="ks-input" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </Field>
          <Field label="Staff limit" hint="Blank: use the plan's">
            <input className="ks-input" type="number" min="0" value={maxStaff} onChange={(e) => setMaxStaff(e.target.value)} />
          </Field>
          <Field label="AI scans / month" hint="Blank: use the plan's">
            <input className="ks-input" type="number" min="0" value={scans} onChange={(e) => setScans(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Feature overrides (tap to cycle: follow plan → forced on → forced off)</p>
          <div className="flex flex-wrap gap-1.5">
            {FEATURES.map((f) => {
              const v = overrides[f.key];
              return (
                <button key={f.key} type="button" onClick={() => cycle(f.key)} className="text-xs font-semibold px-2.5 py-1.5 rounded-full border"
                  style={v === true ? { background: "rgba(34,197,148,0.14)", color: "#7FE0B8", borderColor: "transparent" } : v === false ? { background: "rgba(226,75,74,0.14)", color: "#F29C9C", borderColor: "transparent" } : { color: "var(--text-secondary)", borderColor: "var(--border)" }}>
                  {f.label}{v === true ? " ✓" : v === false ? " ✕" : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Toggle on={api} onChange={setApi} label="Read API access" hint="Lets this shop use API keys on /api/v1 (also needs the global switch on the API & MCP tab)." />
          <Toggle on={mcp} onChange={setMcp} label="MCP access" hint="Lets this shop connect an AI assistant to /api/mcp." />
        </div>

        <Field label="Internal notes">
          <textarea className="ks-input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <SaveButton
          label="Save"
          onSave={async () => {
            await callApi(supabase, "/api/admin/tenant-controls", {
              shopId: tenant.id,
              controls: { plan: plan || null, plan_expires_at: ends || null, limits: { maxStaff, aiScansPerMonth: scans }, feature_overrides: overrides, api_enabled: api, mcp_enabled: mcp, notes },
            });
            onSaved();
          }}
        />
      </div>
    </Modal>
  );
}
