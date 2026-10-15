"use client";

import { useEffect, useState } from "react";
import { callApi } from "@/lib/apiClient";
import { Page, Loading, MigrationNotice, DANGER_TEXT } from "./shared";

// Errors reported by the app in people's browsers (30 days). Same message grouped with a count.
export default function ErrorsTab({ supabase }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    callApi(supabase, "/api/admin/client-errors", null, "GET").then(setData).catch((e) => setError(e.message));
  }, [supabase]);
  if (error) return <p className="text-sm" style={{ color: DANGER_TEXT }}>{error}</p>;
  if (!data) return <Loading />;

  const groups = new Map();
  for (const e of data.errors) {
    const g = groups.get(e.message) || { message: e.message, count: 0, last: e.at, routes: new Set(), shops: new Set(), stack: e.stack, version: e.app_version };
    g.count += 1;
    if (e.route) g.routes.add(e.route);
    if (e.shop) g.shops.add(e.shop);
    groups.set(e.message, g);
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count);

  return (
    <Page title="Errors" subtitle="Errors the app reported from people's browsers, kept 30 days in our own database. Long numbers and emails are removed.">
      <MigrationNotice show={data.needsMigration} />
      {list.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No errors reported.</p>
      ) : (
        <div className="space-y-2">
          {list.map((g) => (
            <details key={g.message} className="ks-card p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                <span className="inline-block min-w-[2rem] text-center text-xs rounded-full px-2 py-0.5 mr-2" style={{ background: "var(--bg-surface-alt)" }}>{g.count}</span>
                {g.message}
              </summary>
              <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                Last: {new Date(g.last).toLocaleString("en-IN")} · version {g.version} · screens: {[...g.routes].join(", ") || "-"} · shops: {[...g.shops].join(", ") || "-"}
              </p>
              {g.stack && <pre className="text-[11px] mt-2 overflow-x-auto whitespace-pre-wrap">{g.stack}</pre>}
            </details>
          ))}
        </div>
      )}
    </Page>
  );
}
