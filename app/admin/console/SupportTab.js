"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, LifeBuoy } from "lucide-react";
import { callApi } from "@/lib/apiClient";
import { Page, Card, Field, Loading, MigrationNotice, fmtDate, DANGER_BG, DANGER_TEXT } from "./shared";

const RESOURCES = [
  { key: "shop", label: "Shop settings", params: [] },
  { key: "members", label: "Members (no staff codes)", params: [] },
  { key: "items", label: "Items and stock", params: ["page"] },
  { key: "bill", label: "One bill", params: ["billNo"] },
  { key: "bills", label: "Bills in a date range (max 31 days)", params: ["from", "to"] },
  { key: "udhaar_balances", label: "Who owes what (udhaar)", params: [] },
  { key: "udhaar_customer", label: "One customer's udhaar", params: ["phone"] },
  { key: "day_close", label: "Day close (last 31)", params: [] },
  { key: "expenses", label: "Expenses in a date range", params: ["from", "to"] },
  { key: "errors", label: "Error reports from the shop", params: [] },
];
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const cell = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

// The only way to look inside a client's shop: open a session (ticket, reason, time), then read
// from the allow-listed screens. Every read is logged and the owner can see it.
export default function SupportTab({ supabase }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await callApi(supabase, "/api/admin/support/sessions", null, "GET"));
    } catch (e) {
      setError(e.message);
    }
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm" style={{ color: DANGER_TEXT }}>{error}</p>;
  if (!data) return <Loading />;

  return (
    <Page title="Support" subtitle="Read a client's shop only inside a support session. Every view is logged, and the owner can see it.">
      <MigrationNotice show={data.needsMigration} />
      <StartForm supabase={supabase} shops={data.shops} onStarted={load} disabled={data.needsMigration} />
      {data.sessions.map((s) => (
        <SessionViewer key={s.id} supabase={supabase} session={s} shops={data.shops} onEnded={load} />
      ))}
    </Page>
  );
}

function StartForm({ supabase, shops, onStarted, disabled }) {
  const [shopId, setShopId] = useState("");
  const [ticket, setTicket] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [kind, setKind] = useState("support");
  const [unmask, setUnmask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await callApi(supabase, "/api/admin/support/start", { shopId, ticket, reason, minutes: Number(minutes), kind, unmaskPhones: unmask });
      setTicket("");
      setReason("");
      onStarted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Start a support session" hint="You need a ticket reference and a real reason. Sessions last up to 2 hours and cover one shop.">
      <form onSubmit={start} className="space-y-3">
        <Field label="Shop">
          <select className="ks-input" required value={shopId} onChange={(e) => setShopId(e.target.value)}>
            <option value="">Choose a shop…</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.status === "closed" ? " (closed)" : ""}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticket reference" hint="3 to 40 characters">
            <input className="ks-input" required minLength={3} maxLength={40} value={ticket} onChange={(e) => setTicket(e.target.value)} />
          </Field>
          <Field label="Minutes">
            <select className="ks-input" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              {[15, 30, 60, 90, 120].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Reason" hint="10 to 300 characters: what you are helping with">
          <textarea className="ks-input" rows={2} required minLength={10} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <select className="ks-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="support">Support (ticket)</option>
              <option value="break_glass">Break glass (incident)</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm mt-6">
            <input type="checkbox" checked={unmask} onChange={(e) => setUnmask(e.target.checked)} /> Show full phone numbers
          </label>
        </div>
        {error && <p className="text-sm rounded-lg px-3 py-2" style={{ background: DANGER_BG, color: DANGER_TEXT }}>{error}</p>}
        <button type="submit" disabled={busy || disabled} className="ks-btn-primary flex items-center gap-2">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LifeBuoy size={16} />} Start session
        </button>
      </form>
    </Card>
  );
}

function SessionViewer({ supabase, session, shops, onEnded }) {
  const covered = useMemo(() => (session.shop_id ? shops.filter((s) => s.id === session.shop_id) : shops.filter((s) => s.org_id === session.org_id)), [session, shops]);
  const [shopId, setShopId] = useState(covered[0]?.id || "");
  const [resource, setResource] = useState("shop");
  const [params, setParams] = useState({ from: daysAgo(6), to: today(), page: 0, billNo: "", phone: "" });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const res = RESOURCES.find((r) => r.key === resource);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const body = { sessionId: session.id, shopId, resource, params: Object.fromEntries(res.params.map((p) => [p, params[p]])) };
      setResult(await callApi(supabase, "/api/admin/support/view", body));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    await callApi(supabase, "/api/admin/support/end", { sessionId: session.id });
    onEnded();
  }

  const cols = result?.rows?.length ? Object.keys(result.rows[0]) : [];
  return (
    <Card title={`Session ${session.ticket_ref}`} hint={`${session.kind === "break_glass" ? "Break glass. " : ""}${session.reason} · ends ${new Date(session.expires_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} (${fmtDate(session.started_at)})`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Shop">
          <select className="ks-input" value={shopId} onChange={(e) => setShopId(e.target.value)}>
            {covered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Look at">
          <select className="ks-input" value={resource} onChange={(e) => { setResource(e.target.value); setResult(null); }}>
            {RESOURCES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        {res.params.includes("from") && <Field label="From"><input type="date" className="ks-input" value={params.from} onChange={(e) => setParams({ ...params, from: e.target.value })} /></Field>}
        {res.params.includes("to") && <Field label="To"><input type="date" className="ks-input" value={params.to} onChange={(e) => setParams({ ...params, to: e.target.value })} /></Field>}
        {res.params.includes("billNo") && <Field label="Bill number"><input className="ks-input" value={params.billNo} onChange={(e) => setParams({ ...params, billNo: e.target.value })} /></Field>}
        {res.params.includes("phone") && <Field label="Customer phone"><input className="ks-input" inputMode="numeric" value={params.phone} onChange={(e) => setParams({ ...params, phone: e.target.value })} /></Field>}
        {res.params.includes("page") && <Field label="Page (500 per page)"><input type="number" min="0" className="ks-input" value={params.page} onChange={(e) => setParams({ ...params, page: Number(e.target.value) })} /></Field>}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={run} disabled={busy || !shopId} className="ks-btn-primary flex items-center gap-2">
          {busy && <Loader2 size={16} className="animate-spin" />} Show
        </button>
        <button onClick={end} className="ks-btn-outline">End session</button>
      </div>
      {error && <p className="text-sm rounded-lg px-3 py-2 mt-3" style={{ background: DANGER_BG, color: DANGER_TEXT }}>{error}</p>}
      {result && (
        <div className="mt-3">
          <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
            {result.count} row(s). {result.phonesMasked ? "Phone numbers are hidden." : "Phone numbers are shown."} This view was logged.
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr>{cols.map((c) => <th key={c} className="text-left px-2 py-1.5" style={{ color: "var(--text-secondary)" }}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    {cols.map((c) => <td key={c} className="px-2 py-1.5 align-top max-w-[260px] truncate" title={cell(r[c])}>{cell(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
