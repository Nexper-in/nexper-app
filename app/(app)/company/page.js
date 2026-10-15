"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, UserPlus, ArrowRight } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import ShopTypeIcon from "@/components/ShopTypeIcon";
import AddBranchModal from "@/components/AddBranchModal";
import Field from "@/components/ui/Field";
import { shopTypeInfo } from "@/lib/shopTypes";
import { ORG_ROLES } from "@/lib/branch";
import { ClosedShopsList } from "@/components/ClosedShops";
import { T, useT } from "@/lib/i18n";

// Marks the role names for translation (they are read through t() below).
const ROLE_LABELS = { owner: T("Owner"), manager: T("Manager"), area_manager: T("Area manager"), analyst: T("Analyst") };
const ROLE_HINTS = {
  owner: T("Everything, in every shop."),
  manager: T("Runs every shop: billing, stock, udhaar, reports. Cannot change settings, the team or delete a shop."),
  area_manager: T("A manager for the shops you choose only."),
  analyst: T("Reads sales, bills and reports in every shop. Cannot change anything."),
};

// The chain owner's view of the company: its shops, and the people who work at
// company level. Everything the shops hold stays in the shops; this only
// connects them.
export default function CompanyPage() {
  const t = useT();
  const router = useRouter();
  const { supabase, shops, activeShopId, setActiveShopId, orgInfo, orgRole, isOrgOwner, canSeeCompany, loading } = useShop();
  const [tab, setTab] = useState("shops");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!loading && orgInfo !== undefined && !canSeeCompany) router.replace("/dashboard");
  }, [loading, orgInfo, canSeeCompany, router]);

  if (!orgInfo || !canSeeCompany) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }
  const { org } = orgInfo;
  const atLimit = shops.length >= org.max_shops;

  return (
    <div className="pt-4">
      <h1 className="ks-display font-bold text-xl">{org.name}</h1>
      <p className="text-sm text-[var(--text-secondary)] mt-0.5 mb-4">
        {t("{n} of {max} shops", { n: shops.length, max: org.max_shops })} · {t(ROLE_LABELS[orgRole])}
      </p>

      <div className="flex gap-1.5 mb-4 p-1 rounded-full bg-[var(--bg-surface-alt)] max-w-xs">
        {[["shops", t("Shops")], ["team", t("Team")]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 py-2 rounded-full text-sm font-semibold ${tab === id ? "bg-[var(--bg-surface)] shadow" : "text-[var(--text-secondary)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "shops" ? (
        <>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {shops.map((s) => (
              <div key={s.id} className="ks-card p-4 flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-alt)] flex items-center justify-center shrink-0">
                  <ShopTypeIcon type={s.type} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{t(shopTypeInfo(s.type).label)}</p>
                </div>
                {s.id === activeShopId ? (
                  <span className="text-[10px] font-bold uppercase text-[var(--accent-soft-text)] shrink-0 whitespace-nowrap">{t("Open now")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveShopId(s.id);
                      router.push("/dashboard");
                    }}
                    className="ks-btn-outline text-xs !py-2 flex items-center gap-1 shrink-0 whitespace-nowrap"
                  >
                    {t("Open")} <ArrowRight size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isOrgOwner && (
            <div className="mt-4">
              {atLimit ? (
                <p className="text-sm rounded-xl px-3 py-2.5" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                  {t("Your plan allows {n} shop(s). Contact us to add more branches.", { n: org.max_shops })}
                </p>
              ) : (
                <button type="button" onClick={() => setShowAdd(true)} className="ks-btn-primary flex items-center gap-1.5">
                  <Plus size={16} /> {t("Add a branch")}
                </button>
              )}
            </div>
          )}
          <ClosedShopsList onOpen={() => router.push("/dashboard")} />
        </>
      ) : (
        <TeamTab supabase={supabase} org={org} shops={shops} canEdit={isOrgOwner} />
      )}

      {showAdd && <AddBranchModal onClose={() => setShowAdd(false)} onCreated={() => router.push("/dashboard")} />}
    </div>
  );
}

function TeamTab({ supabase, org, shops, canEdit }) {
  const t = useT();
  const { showToast } = useShop();
  const [team, setTeam] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [areaShops, setAreaShops] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("org_team", { p_org: org.id });
    setTeam(data || []);
  }, [supabase, org.id]);
  useEffect(() => {
    load();
  }, [load]);

  const friendly = (m) => {
    if (/No Nexper account/.test(m)) return t("No Nexper account has that email. Ask them to sign up first.");
    if (/at least one shop/.test(m)) return t("Choose at least one shop for an area manager.");
    if (/That is the owner/.test(m)) return t("That is the owner.");
    return m;
  };

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc("org_set_member", { p_org: org.id, p_email: email.trim(), p_role: role, p_shop_ids: role === "area_manager" ? areaShops : [] });
    setBusy(false);
    if (err) return setError(friendly(err.message));
    setEmail("");
    setAreaShops([]);
    showToast(t("Team updated"));
    load();
  }

  async function remove(m) {
    if (!window.confirm(t("Remove {name} from the company team?", { name: m.name }))) return;
    const { error: err } = await supabase.rpc("org_remove_member", { p_org: org.id, p_user: m.user_id });
    if (err) return setError(friendly(err.message));
    load();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="ks-card divide-y divide-[var(--border)]">
        {team === null && <p className="p-4 text-sm text-[var(--text-secondary)]">{t("Loading…")}</p>}
        {(team || []).map((m) => (
          <div key={m.user_id} className="p-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{m.name}</p>
              <p className="text-xs text-[var(--text-secondary)] truncate">{m.email}</p>
              <p className="text-xs mt-1">
                <span className="font-bold">{t(ROLE_LABELS[m.role])}</span>
                {m.role === "area_manager" && (
                  <span className="text-[var(--text-secondary)]"> · {shops.filter((s) => (m.shop_ids || []).includes(s.id)).map((s) => s.name).join(", ")}</span>
                )}
              </p>
            </div>
            {canEdit && m.role !== "owner" && (
              <button type="button" aria-label={t("Remove")} onClick={() => remove(m)} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ color: "var(--danger)" }}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <form onSubmit={add} className="ks-card p-4 space-y-3">
          <h2 className="font-bold flex items-center gap-1.5"><UserPlus size={16} /> {t("Add someone to the team")}</h2>
          <Field label={t("Their Nexper email")}>
            <input type="email" required className="ks-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label={t("Role")}>
            <select className="ks-input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ORG_ROLES.filter((r) => r.id !== "owner").map((r) => (
                <option key={r.id} value={r.id}>{t(ROLE_LABELS[r.id])}</option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-[var(--text-secondary)]">{t(ROLE_HINTS[role])}</p>
          {role === "area_manager" && (
            <div className="space-y-1.5">
              {shops.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={areaShops.includes(s.id)} onChange={() => setAreaShops((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))} />
                  {s.name}
                </label>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
          <button disabled={busy} className="ks-btn-primary flex items-center gap-1.5">
            {busy && <Loader2 size={15} className="animate-spin" />} {t("Add to team")}
          </button>
        </form>
      )}
    </div>
  );
}
