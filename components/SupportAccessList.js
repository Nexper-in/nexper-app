"use client";

import { useEffect, useState } from "react";
import { useShop } from "@/components/ShopContext";
import { useT } from "@/lib/i18n";

const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// The owner sees every time Nexper support looked inside their shop: when, the ticket, why, and
// how many screens were viewed. Quietly empty before database update 038.
export default function SupportAccessList() {
  const t = useT();
  const { supabase, activeShop } = useShop();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!activeShop?.org_id) return;
    let live = true;
    supabase.rpc("support_session_summary", { p_org: activeShop.org_id }).then(({ data, error }) => {
      if (live) setRows(error ? [] : data || []);
    });
    return () => {
      live = false;
    };
  }, [supabase, activeShop?.org_id]);
  if (rows === null) return null;

  return (
    <details className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
      <summary className="text-xs font-semibold cursor-pointer">{t("Nexper support access")}</summary>
      <p className="text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>
        {t("Nexper support can look inside your shop only when you ask for help, with a ticket, for at most 2 hours. Every time is listed here.")}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs mt-2 font-semibold">{t("Nobody from Nexper has looked at your shop.")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.slice(0, 20).map((r) => (
            <li key={r.id} className="text-xs">
              <p className="font-semibold">{when(r.started_at)} · {r.ticket_ref}</p>
              <p style={{ color: "var(--text-secondary)" }}>
                {r.reason} · {t("{n} screens viewed", { n: Number(r.views) })}
                {r.shop_name ? ` · ${r.shop_name}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
