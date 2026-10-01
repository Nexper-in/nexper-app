"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Trash2, Plug } from "lucide-react";
import { callApi } from "@/lib/apiClient";
import { API_SCOPES } from "@/lib/platformDefaults";
import { Page, Card, Field, Toggle, SaveButton, Loading, MigrationNotice, useSettings, DANGER_TEXT, OK_BG, OK_TEXT, fmtDate } from "./shared";

export default function IntegrationsTab({ supabase }) {
  const { settings, save, needsMigration, error } = useSettings(supabase);
  const [integrations, setIntegrations] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [shopId, setShopId] = useState("");
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(API_SCOPES);
  const [fresh, setFresh] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (settings) setIntegrations(settings.integrations);
  }, [settings]);

  useEffect(() => {
    callApi(supabase, "/api/admin/tenant-controls", null, "GET").then((j) => setTenants(j.tenants || [])).catch(() => {});
  }, [supabase]);

  const loadKeys = useCallback(async () => {
    if (!shopId) return setKeys([]);
    const j = await callApi(supabase, `/api/admin/api-keys?shopId=${encodeURIComponent(shopId)}`, null, "GET");
    setKeys(j.keys || []);
  }, [supabase, shopId]);
  useEffect(() => {
    loadKeys().catch(() => {});
  }, [loadKeys]);

  async function createKey(e) {
    e.preventDefault();
    setErr("");
    setFresh(null);
    try {
      const j = await callApi(supabase, "/api/admin/api-keys", { shopId, name, scopes });
      setFresh(j.key);
      setName("");
      loadKeys();
    } catch (e2) {
      setErr(e2.message);
    }
  }
  async function revoke(id) {
    await callApi(supabase, "/api/admin/api-keys", { action: "revoke", id });
    loadKeys();
  }

  if (error) return <p className="text-sm" style={{ color: DANGER_TEXT }}>{error}</p>;
  if (!settings || !integrations) return <Loading />;
  const base = typeof window !== "undefined" ? window.location.origin : "https://app.nexper.in";
  const tenant = tenants.find((t) => t.id === shopId);

  return (
    <Page title="API & MCP" subtitle="Let a shop's own tools or an AI assistant read its numbers. Read only. Off until you switch it on here and for the shop.">
      <MigrationNotice show={needsMigration} />

      <Card title="Global switches" hint="Turning one off stops it for every shop immediately.">
        <Toggle on={integrations.apiEnabled} onChange={(v) => setIntegrations((i) => ({ ...i, apiEnabled: v }))} label="Read API (/api/v1)" hint="REST, JSON. Needs an API key." />
        <Toggle on={integrations.mcpEnabled} onChange={(v) => setIntegrations((i) => ({ ...i, mcpEnabled: v }))} label="MCP endpoint (/api/mcp)" hint="For AI assistants such as Claude. Customer phone numbers are masked." />
        <div className="max-w-xs my-3">
          <Field label="Requests per minute, per key">
            <input className="ks-input" type="number" min="1" max="6000" value={integrations.rateLimitPerMin} onChange={(e) => setIntegrations((i) => ({ ...i, rateLimitPerMin: Number(e.target.value) }))} />
          </Field>
        </div>
        <SaveButton onSave={() => save("integrations", integrations)} disabled={needsMigration} />
      </Card>

      <Card title="API keys" hint="Create a key for a shop. The full key is shown once, then only its first characters. Each shop must also have API / MCP access on in the Tenants tab.">
        <div className="max-w-sm mb-3">
          <Field label="Shop">
            <select className="ks-input" value={shopId} onChange={(e) => { setShopId(e.target.value); setFresh(null); }}>
              <option value="">Choose a shop…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        {shopId && (
          <>
            {tenant && !tenant.controls?.api_enabled && !tenant.controls?.mcp_enabled && (
              <p className="text-xs mb-3" style={{ color: "var(--warn)" }}>This shop has API and MCP access off. Keys won&apos;t work until you turn it on in Tenants → Manage.</p>
            )}
            <form onSubmit={createKey} className="space-y-3 mb-4">
              <Field label="Key name"><input className="ks-input max-w-sm" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accountant dashboard" /></Field>
              <div className="flex flex-wrap gap-3">
                {API_SCOPES.map((s) => (
                  <label key={s} className="text-xs flex items-center gap-1.5">
                    <input type="checkbox" checked={scopes.includes(s)} onChange={() => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} /> <code>{s}</code>
                  </label>
                ))}
              </div>
              <button className="ks-btn-primary flex items-center gap-2"><KeyRound size={15} /> Create key</button>
            </form>
            {err && <p className="text-xs mb-3" style={{ color: DANGER_TEXT }}>{err}</p>}
            {fresh && (
              <div className="rounded-xl p-3 text-sm mb-4" style={{ background: OK_BG, color: OK_TEXT }}>
                <p className="font-semibold mb-1">Copy this key now. It is not shown again.</p>
                <p className="flex items-center gap-2 break-all"><code className="font-bold">{fresh}</code>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(fresh)} aria-label="Copy key"><Copy size={14} /></button></p>
              </div>
            )}
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {keys.length === 0 && <p className="text-sm py-2" style={{ color: "var(--text-secondary)" }}>No keys for this shop.</p>}
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{k.name} <code className="text-xs" style={{ color: "var(--text-secondary)" }}>{k.key_prefix}…</code></p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{k.scopes.join(", ")} · made {fmtDate(k.created_at)} · last used {k.last_used_at ? fmtDate(k.last_used_at) : "never"}</p>
                  </div>
                  {k.revoked_at ? <span className="text-[10px] uppercase font-bold" style={{ color: "var(--text-secondary)" }}>revoked</span> : <button onClick={() => revoke(k.id)} aria-label="Revoke key" style={{ color: DANGER_TEXT }}><Trash2 size={14} /></button>}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="How to use" hint="Give these to whoever is connecting.">
        <p className="text-xs font-semibold mb-1 flex items-center gap-1.5"><Plug size={13} /> REST</p>
        <pre className="text-[11px] rounded-lg p-3 overflow-x-auto mb-3" style={{ background: "var(--bg-surface-alt)" }}>{`curl -H "Authorization: Bearer nxp_YOUR_KEY" \\
  ${base}/api/v1/summary/today

GET /api/v1/shop            read:shop
GET /api/v1/items?q=&limit= read:stock
GET /api/v1/low-stock       read:stock
GET /api/v1/expiring?days=  read:stock
GET /api/v1/bills?from=&to= read:bills
GET /api/v1/summary/today   read:bills
GET /api/v1/udhaar          read:udhaar`}</pre>
        <p className="text-xs font-semibold mb-1 flex items-center gap-1.5"><Plug size={13} /> MCP (Claude and other assistants)</p>
        <pre className="text-[11px] rounded-lg p-3 overflow-x-auto" style={{ background: "var(--bg-surface-alt)" }}>{`{
  "mcpServers": {
    "nexper": {
      "type": "http",
      "url": "${base}/api/mcp",
      "headers": { "Authorization": "Bearer nxp_YOUR_KEY" }
    }
  }
}

Tools: get_shop, search_items, low_stock, expiring_items,
       today_summary, recent_bills, outstanding_udhaar`}</pre>
      </Card>
    </Page>
  );
}
