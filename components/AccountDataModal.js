"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useShop } from "@/components/ShopContext";
import { createShopBackup } from "@/lib/exportData";
import { downloadFile } from "@/lib/gstReport";
import { T, useT } from "@/lib/i18n";

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const ROLE = { owner: T("Owner"), manager: T("Manager"), area_manager: T("Area manager"), analyst: T("Analyst"), staff: T("Staff") };

// "My account data": what Nexper holds about the signed-in person (their sign-in, their shops and
// roles, who from Nexper support looked inside) and a download of every shop they own.
export default function AccountDataModal({ onClose }) {
  const t = useT();
  const { supabase, user, shops, closedShops, orgs, orgInfo, showToast } = useShop();
  const [support, setSupport] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const owned = orgs.filter((o) => o.owner_id === user?.id);
  const ownsAny = owned.length > 0;
  const allShops = [...shops, ...closedShops];
  const mine = allShops.filter((s) => owned.some((o) => o.id === s.org_id));

  useEffect(() => {
    (async () => {
      let n = 0;
      for (const o of owned) {
        const { data } = await supabase.rpc("support_session_summary", { p_org: o.id });
        n += (data || []).length;
      }
      setSupport(n);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, orgs.length]);

  async function download(shop) {
    setBusy("dl-" + shop.id);
    setError("");
    try {
      const { blob, filename } = await createShopBackup(supabase, shop);
      downloadFile(filename, blob, "application/zip");
      showToast(t("Backup downloaded"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal title={t("My account data")} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>{t("Your sign-in")}</p>
          <p className="font-semibold">{user?.user_metadata?.full_name || user?.email}</p>
          <p style={{ color: "var(--text-secondary)" }}>{user?.email} · {t("joined {date}", { date: day(user?.created_at) })}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>{t("Your shops and roles")}</p>
          <ul className="space-y-1">
            {allShops.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate">{s.name}</span>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {owned.some((o) => o.id === s.org_id) ? t(ROLE.owner) : t(ROLE[orgInfo?.role] || ROLE.staff)}
                  {s.status === "closed" ? ` · ${t("closed")}` : ""}
                </span>
              </li>
            ))}
            {allShops.length === 0 && <li style={{ color: "var(--text-secondary)" }}>{t("No shops yet.")}</li>}
          </ul>
        </div>

        {ownsAny && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>{t("Nexper support access")}</p>
            <p>{support === null ? "…" : support === 0 ? t("Nobody from Nexper has looked at your shop.") : t("{n} support sessions on your shops. The list is in Store settings.", { n: support })}</p>
          </div>
        )}

        {mine.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>{t("Download everything")}</p>
            <div className="space-y-1.5">
              {mine.map((s) => (
                <button key={s.id} type="button" onClick={() => download(s)} disabled={!!busy} className="ks-btn-outline w-full text-xs flex items-center justify-center gap-2">
                  {busy === "dl-" + s.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {s.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-secondary)" }}>{t("Items, bills, udhaar, expenses and more as spreadsheet files. Keep it safe: it has customer names and phone numbers.")}</p>
          </div>
        )}

        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}

      </div>
    </Modal>
  );
}
