"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Mail, Trash2, UserPlus, Loader2 } from "lucide-react";
import { callApi } from "@/lib/apiClient";
import { Page, Card, Field, SaveButton, Loading, MigrationNotice, useSettings, DANGER_BG, DANGER_TEXT, OK_BG, OK_TEXT, fmtDate } from "./shared";

const MODES = [
  { id: "open", label: "Open", hint: "Anyone can sign up and open a shop (today's behaviour)." },
  { id: "invite_only", label: "Invite only", hint: "Only emails you invite below can open a shop." },
  { id: "closed", label: "Closed", hint: "Nobody new can open a shop. Existing shops are not affected." },
];

export default function OnboardingTab({ supabase }) {
  const { settings, save, needsMigration, error } = useSettings(supabase);
  const [signup, setSignup] = useState(null);
  const [invites, setInvites] = useState([]);
  const [invEmail, setInvEmail] = useState("");
  const [invPlan, setInvPlan] = useState("free");
  const [invNote, setInvNote] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState({ email: "", ownerName: "", shopName: "", type: "kirana", plan: "free" });
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (settings) setSignup(settings.signup);
  }, [settings]);

  const loadInvites = useCallback(async () => {
    try {
      const json = await callApi(supabase, "/api/admin/invites", null, "GET");
      setInvites(json.invites || []);
    } catch {}
  }, [supabase]);
  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  async function createInvite(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const json = await callApi(supabase, "/api/admin/invites", { action: "create", email: invEmail, plan: invPlan, note: invNote, sendEmail });
      setMsg({ ok: true, text: json.emailed ? "Invite saved and email sent." : "Invite saved. Tell them to sign up with that email." });
      setInvEmail("");
      setInvNote("");
      loadInvites();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id) {
    await callApi(supabase, "/api/admin/invites", { action: "revoke", id });
    loadInvites();
  }
  async function createTenant(e) {
    e.preventDefault();
    setBusy(true);
    setCreated(null);
    setMsg(null);
    try {
      const json = await callApi(supabase, "/api/admin/create-tenant", tenant);
      setCreated(json);
      setTenant({ email: "", ownerName: "", shopName: "", type: "kirana", plan: "free" });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm" style={{ color: DANGER_TEXT }}>{error}</p>;
  if (!settings || !signup) return <Loading />;

  return (
    <Page title="Onboarding" subtitle="Who can open a shop on Nexper, and how new customers get started.">
      <MigrationNotice show={needsMigration} />

      <Card title="Sign-up mode" hint="Enforced in the database, not just on the screens.">
        <div className="grid sm:grid-cols-3 gap-2 mb-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setSignup((s) => ({ ...s, mode: m.id }))}
              aria-pressed={signup.mode === m.id}
              className="text-left rounded-xl p-3 border"
              style={signup.mode === m.id ? { borderColor: "var(--accent)", background: "var(--accent-soft-bg)" } : { borderColor: "var(--border)" }}
            >
              <span className="block text-sm font-bold">{m.label}</span>
              <span className="block text-[11px]" style={{ color: "var(--text-secondary)" }}>{m.hint}</span>
            </button>
          ))}
        </div>
        <div className="mb-3">
          <Field label="Message shown when someone is turned away (optional)">
            <input className="ks-input" maxLength={200} value={signup.message} onChange={(e) => setSignup((s) => ({ ...s, message: e.target.value }))} />
          </Field>
        </div>
        <SaveButton onSave={() => save("signup", signup)} disabled={needsMigration} />
      </Card>

      <Card title="Open a shop for a customer" hint="You create their sign-in and shop in one go and hand over a one-time password.">
        <form onSubmit={createTenant} className="grid sm:grid-cols-2 gap-3">
          <Field label="Owner's email"><input className="ks-input" type="email" required value={tenant.email} onChange={(e) => setTenant({ ...tenant, email: e.target.value })} /></Field>
          <Field label="Owner's name"><input className="ks-input" value={tenant.ownerName} onChange={(e) => setTenant({ ...tenant, ownerName: e.target.value })} /></Field>
          <Field label="Shop name"><input className="ks-input" required value={tenant.shopName} onChange={(e) => setTenant({ ...tenant, shopName: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className="ks-input" value={tenant.type} onChange={(e) => setTenant({ ...tenant, type: e.target.value })}>
                <option value="kirana">Kirana / Grocery</option>
                <option value="supermarket">Supermarket</option>
                <option value="automobile">Auto parts</option>
                <option value="clothing">Clothing</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Plan">
              <select className="ks-input" value={tenant.plan} onChange={(e) => setTenant({ ...tenant, plan: e.target.value })}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <button disabled={busy} className="ks-btn-primary flex items-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Create shop
            </button>
          </div>
        </form>
        {created && (
          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: OK_BG, color: OK_TEXT }}>
            <p className="font-semibold mb-1">Shop created. Share this with the owner now. It is not shown again.</p>
            <p>Email: <b>{created.email}</b></p>
            <p className="flex items-center gap-2">
              Password: <code className="font-bold">{created.password}</code>
              <button type="button" onClick={() => navigator.clipboard?.writeText(created.password)} aria-label="Copy password"><Copy size={14} /></button>
            </p>
            <p className="text-xs mt-1">Ask them to change it from Forgot password after signing in.</p>
          </div>
        )}
      </Card>

      <Card title="Invites" hint="Needed when sign-up is invite only. An invite is used up when that email opens its shop.">
        <form onSubmit={createInvite} className="grid sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end mb-3">
          <Field label="Email"><input className="ks-input" type="email" required value={invEmail} onChange={(e) => setInvEmail(e.target.value)} /></Field>
          <Field label="Plan">
            <select className="ks-input" value={invPlan} onChange={(e) => setInvPlan(e.target.value)}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
          </Field>
          <Field label="Note (optional)"><input className="ks-input" value={invNote} onChange={(e) => setInvNote(e.target.value)} placeholder="Who is this?" /></Field>
          <button disabled={busy} className="ks-btn-primary flex items-center gap-2 disabled:opacity-40"><Mail size={15} /> Invite</button>
        </form>
        <label className="flex items-center gap-2 text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          Also send an email from Supabase (needs email sending set up in your Supabase project)
        </label>
        {msg && (
          <p className="text-xs rounded-lg px-3 py-2 mb-3" style={msg.ok ? { background: OK_BG, color: OK_TEXT } : { background: DANGER_BG, color: DANGER_TEXT }}>{msg.text}</p>
        )}
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {invites.length === 0 && <p className="text-sm py-3" style={{ color: "var(--text-secondary)" }}>No invites yet.</p>}
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{i.email}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{i.plan} · {fmtDate(i.created_at)}{i.note ? ` · ${i.note}` : ""}</p>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={i.status === "pending" ? { background: "var(--warn-soft)", color: "var(--warn)" } : i.status === "used" ? { background: OK_BG, color: OK_TEXT } : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}>{i.status}</span>
              {i.status === "pending" && (
                <button onClick={() => revoke(i.id)} aria-label="Revoke invite" style={{ color: DANGER_TEXT }}><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}
