"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Copy, Printer, Trash2, Users, Tag, Sparkles, Star } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import GroupPoster from "@/components/GroupPoster";
import FestivalPoster from "@/components/FestivalPoster";
import { upcomingFestivals } from "@/lib/festivals";
import { isGroupInviteLink, offerMessageText, groupInviteText, whatsappLink, OFFER_KINDS } from "@/lib/messaging";
import { T, useT } from "@/lib/i18n";
import { hasFeature } from "@/lib/platformConfig";

const KINDS = [
  { id: "offer", label: T("Offer"), icon: Tag },
  { id: "arrival", label: T("New arrival"), icon: Sparkles },
  { id: "special", label: T("Today's special"), icon: Star },
];

export default function OffersPage() {
  const t = useT();
  const router = useRouter();
  const { supabase, activeShop, activeShopId, currentMember, isOwner, showToast, reload } = useShop();
  const [groupUrl, setGroupUrl] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [kind, setKind] = useState("offer");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [validTill, setValidTill] = useState("");
  const [posts, setPosts] = useState([]);
  const [activeOffers, setActiveOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [poster, setPoster] = useState(false);
  const [festival, setFestival] = useState(null);

  // Owners only: this is a pricing and marketing decision.
  useEffect(() => {
    if (currentMember && !isOwner) router.replace("/dashboard");
  }, [currentMember, isOwner, router]);

  useEffect(() => {
    setGroupUrl(activeShop?.whatsapp_group_url || "");
  }, [activeShop?.whatsapp_group_url]);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: postsData }, { data: offersData }] = await Promise.all([
      supabase.from("offer_posts").select("*").eq("shop_id", activeShopId).order("created_at", { ascending: false }).limit(10),
      supabase
        .from("clearance_offers")
        .select("name, discount_pct, end_date, items:clearance_offer_items(shop_product:shop_products(product:products(name)))")
        .eq("shop_id", activeShopId)
        .lte("start_date", today)
        .gte("end_date", today),
    ]);
    setPosts(postsData || []);
    setActiveOffers(offersData || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const savedUrl = activeShop?.whatsapp_group_url || "";
  const message = title.trim() ? offerMessageText({ kind, shopName: activeShop?.name, title, details, validTill, groupUrl: savedUrl }) : "";

  async function saveGroup() {
    const url = groupUrl.trim();
    if (url && !isGroupInviteLink(url)) {
      showToast(t("That doesn't look like a WhatsApp group invite link."), "error");
      return;
    }
    setSavingGroup(true);
    const { error } = await supabase.from("shops").update({ whatsapp_group_url: url || null }).eq("id", activeShopId);
    setSavingGroup(false);
    if (error) {
      showToast(/whatsapp_group_url|schema cache/i.test(error.message) ? t("This needs the latest database update. Ask your admin.") : error.message, "error");
      return;
    }
    showToast(url ? t("Group link saved") : t("Group link removed"));
    reload();
  }

  function useClearance(o) {
    const names = (o.items || []).map((i) => i.shop_product?.product?.name).filter(Boolean).slice(0, 5).join(", ");
    setKind("offer");
    setTitle(`${Math.round(o.discount_pct)}% off${names ? ` — ${names}` : ""}`);
    setValidTill(o.end_date);
  }

  async function logPost() {
    const { error } = await supabase.from("offer_posts").insert({ shop_id: activeShopId, kind, title: title.trim(), message });
    if (!error) load();
  }

  async function sendOnWhatsApp() {
    if (!message) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    await logPost();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("Copied"));
    } catch {
      showToast(t("Could not copy"), "error");
    }
  }

  async function removePost(id) {
    await supabase.from("offer_posts").delete().eq("id", id);
    setPosts((p) => p.filter((x) => x.id !== id));
  }

  function printPoster() {
    setFestival(null);
    setPoster(true);
    setTimeout(() => {
      window.print();
      setPoster(false);
    }, 400);
  }

  function pickFestival(f) {
    setFestival(f);
    setKind("offer");
    setTitle(t(f.title));
    setDetails(t(f.details));
  }

  function printFestivalPoster() {
    setPoster("festival");
    setTimeout(() => {
      window.print();
      setPoster(false);
    }, 400);
  }

  if (!hasFeature(activeShop, "offers_group")) {
    return <div className="pt-6 text-sm" style={{ color: "var(--text-secondary)" }}>{t("This isn't available right now.")}</div>;
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading…")}
      </div>
    );
  }

  return (
    <div className="pt-6 max-w-3xl space-y-6">
      <div className="hidden lg:block">
        <h1 className="ks-display font-bold text-xl">{t("Offers & group")}</h1>
      </div>

      {/* Customer WhatsApp group */}
      <section className="ks-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Users size={16} style={{ color: "var(--accent-soft-text)" }} />
          <h2 className="ks-display font-bold">{t("Customer WhatsApp group")}</h2>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          {t("Create a group in WhatsApp, open Invite via link, and paste the link here. Nexper adds it to your bills and makes a QR poster. You tap Send in WhatsApp; Nexper never posts for you.")}
        </p>
        <div className="flex gap-2">
          <input className="ks-input" placeholder="https://chat.whatsapp.com/…" value={groupUrl} onChange={(e) => setGroupUrl(e.target.value)} />
          <button onClick={saveGroup} disabled={savingGroup || groupUrl.trim() === savedUrl} className="ks-btn-primary shrink-0 disabled:opacity-40">
            {savingGroup ? <Loader2 size={15} className="animate-spin" /> : t("Save")}
          </button>
        </div>
        {savedUrl && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copy(savedUrl)} className="ks-btn-outline flex items-center gap-1.5 text-sm">
                <Copy size={14} /> {t("Copy link")}
              </button>
              <button onClick={printPoster} className="ks-btn-outline flex items-center gap-1.5 text-sm">
                <Printer size={14} /> {t("Print QR poster")}
              </button>
            </div>
            <div className="flex gap-2">
              <input className="ks-input" inputMode="tel" placeholder={t("Customer's phone number")} value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} />
              <button
                onClick={() => window.open(whatsappLink(invitePhone, groupInviteText(activeShop?.name, savedUrl)), "_blank", "noopener,noreferrer")}
                disabled={invitePhone.replace(/\D/g, "").length < 10}
                className="shrink-0 flex items-center gap-1.5 text-sm font-semibold px-4 rounded-xl text-white disabled:opacity-40"
                style={{ background: "#25D366" }}
              >
                <Send size={14} /> {t("Invite")}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Composer */}
      <section className="ks-card p-5">
        <h2 className="ks-display font-bold mb-3">{t("New post")}</h2>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {KINDS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setKind(id)}
              aria-pressed={kind === id}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full"
              style={kind === id ? { background: "var(--strong)", color: "var(--on-strong)" } : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
            >
              <Icon size={13} /> {t(label)}
            </button>
          ))}
        </div>

        <div className="mb-3">
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>{t("Festival templates")}</p>
          <div className="flex gap-1.5 overflow-x-auto ks-scroll pb-1">
            {upcomingFestivals().slice(0, 6).map((f) => (
              <button
                key={f.id}
                onClick={() => pickFestival(f)}
                aria-pressed={festival?.id === f.id}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={festival?.id === f.id ? { background: "var(--strong)", color: "var(--on-strong)" } : { background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}
              >
                {f.emoji} {t(f.name)}
              </button>
            ))}
          </div>
        </div>

        {activeOffers.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>{t("Use a running offer")}</p>
            <div className="flex flex-wrap gap-1.5">
              {activeOffers.map((o, i) => (
                <button key={i} onClick={() => useClearance(o)} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}>
                  {o.name} · {Math.round(o.discount_pct)}%
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          <input className="ks-input" placeholder={t("Headline, e.g. 10% off on all dals")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="ks-input" rows={3} placeholder={t("Details (optional)")} value={details} onChange={(e) => setDetails(e.target.value)} />
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            {t("Valid till (optional)")}
            <input type="date" className="ks-input !w-auto" value={validTill} onChange={(e) => setValidTill(e.target.value)} />
          </label>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl p-4 text-sm whitespace-pre-wrap" style={{ background: "var(--bg-surface-alt)" }} aria-label={t("Preview")}>
            {message}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={sendOnWhatsApp} disabled={!message} className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-xl text-white disabled:opacity-40" style={{ background: "#25D366" }}>
            <Send size={15} /> {t("Send on WhatsApp")}
          </button>
          <button
            onClick={async () => {
              await copy(message);
              logPost();
            }}
            disabled={!message}
            className="ks-btn-outline flex items-center gap-1.5 text-sm disabled:opacity-40"
          >
            <Copy size={14} /> {t("Copy message")}
          </button>
          {festival && title.trim() && (
            <button onClick={printFestivalPoster} className="ks-btn-outline flex items-center gap-1.5 text-sm">
              <Printer size={14} /> {t("Print festival poster")}
            </button>
          )}
        </div>
        <p className="text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>
          {t("WhatsApp opens with the message ready. Pick your group and tap Send.")}
        </p>
      </section>

      {/* Past posts */}
      {posts.length > 0 && (
        <section>
          <h2 className="ks-display font-bold text-base mb-2">{t("Recent posts")}</h2>
          <div className="ks-card overflow-hidden">
            {posts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0">
                <span className="text-lg shrink-0">{(OFFER_KINDS[p.kind] || OFFER_KINDS.offer).emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{p.title}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(p.message)}`, "_blank", "noopener,noreferrer")} aria-label={t("Send again")} className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "#25D366" }}>
                  <Send size={13} />
                </button>
                <button onClick={() => removePost(p.id)} aria-label={t("Delete")} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {poster === "festival" && festival && (
        <div className="ks-print-only">
          <FestivalPoster
            shopName={activeShop?.name}
            emoji={festival.emoji}
            theme={festival.theme}
            title={title}
            details={details}
            validText={validTill ? t("Valid till {date}", { date: new Date(`${validTill}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }) : ""}
            groupUrl={savedUrl}
            scanText={t("Scan to join our WhatsApp group")}
          />
        </div>
      )}
      {poster === true && (
        <div className="ks-print-only">
          <GroupPoster shopName={activeShop?.name} groupUrl={savedUrl} headline={t("Join our WhatsApp group")} sub={t("Scan to get offers and new arrivals")} />
        </div>
      )}
    </div>
  );
}
