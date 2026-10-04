"use client";

import { clearLocalData } from "@/lib/clearLocalData";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ChevronDown, Download, Fingerprint, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { useTheme } from "@/lib/theme";
import { displayName, initials } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import LanguagePicker from "@/components/LanguagePicker";
import ExportDataModal from "@/components/ExportDataModal";
import PasskeyModal from "@/components/PasskeyModal";

// Top-right account button on every app screen: who is signed in, the
// Night/Light switch for this device, store settings and sign out.
export default function AccountMenu({ onOpenSettings }) {
  const { supabase, user, activeShop, isOwner, currentMember } = useShop();
  const { theme, setTheme } = useTheme();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPasskeys, setShowPasskeys] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    await clearLocalData();
    // Back to the website. (On localhost there is no website, so stay on sign-in.)
    if (/(^|\.)nexper\.in$/.test(window.location.hostname)) window.location.href = SITE.url;
    else router.replace("/login");
  }

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const fullName = user?.user_metadata?.full_name || displayName(user);
  const role = isOwner ? t("Owner") : currentMember?.role === "staff" ? t("Staff") : "";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Account")}
        className="flex items-center gap-2 rounded-full pl-1 pr-1 lg:pr-2.5 py-1 transition-colors hover:bg-[var(--bg-surface-alt)]"
      >
        <Avatar url={avatarUrl} text={initials(user)} />
        <span className="hidden lg:block text-sm font-semibold max-w-[140px] truncate">{fullName}</span>
        <ChevronDown size={15} className="hidden lg:block" style={{ color: "var(--text-secondary)" }} />
      </button>

      {open && (
        <div
          role="menu"
          className="ks-card absolute right-0 top-[calc(100%+8px)] z-50 w-72 p-2 ks-fade-up"
          style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}
        >
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar url={avatarUrl} text={initials(user)} size={40} />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{fullName || t("Signed in")}</p>
              {user?.email && !user.email.endsWith(".internal") && (
                <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {user.email}
                </p>
              )}
              <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                {[role, activeShop?.name].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <div className="my-1 h-px" style={{ background: "var(--border)" }} />

          <div className="px-2.5 py-2">
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {t("Look on this device")}
            </p>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: "var(--bg-surface-alt)" }}>
              {[
                { id: "dark", label: t("Night"), Icon: Moon },
                { id: "light", label: t("Light"), Icon: Sun },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === id}
                  onClick={() => setTheme(id)}
                  className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors"
                  style={
                    theme === id
                      ? { background: "var(--bg-surface)", color: "var(--text-primary)", boxShadow: "var(--shadow-card)" }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-2.5 py-2">
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {t("Language")}
            </p>
            <LanguagePicker variant="grid" />
          </div>

          <div className="my-1 h-px" style={{ background: "var(--border)" }} />

          {isOwner && (
            <MenuItem
              icon={Settings}
              label={t("Store settings")}
              onClick={() => {
                setOpen(false);
                onOpenSettings?.();
              }}
            />
          )}
          <MenuItem
            icon={Fingerprint}
            label={t("Fingerprint / Face ID")}
            onClick={() => {
              setOpen(false);
              setShowPasskeys(true);
            }}
          />
          {isOwner && (
            <MenuItem
              icon={Download}
              label={t("Download my data")}
              onClick={() => {
                setOpen(false);
                setShowExport(true);
              }}
            />
          )}
          <MenuItem icon={LogOut} label={t("Sign out")} onClick={handleSignOut} danger />
        </div>
      )}
      {/* In the page body, not in this bar: the bar has a blur effect that would trap a full-screen dialog. */}
      {showExport && createPortal(<ExportDataModal onClose={() => setShowExport(false)} />, document.body)}
      {showPasskeys && createPortal(<PasskeyModal onClose={() => setShowPasskeys(false)} />, document.body)}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-[var(--bg-surface-alt)]"
      style={danger ? { color: "var(--danger)" } : undefined}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

function Avatar({ url, text, size = 32 }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" className="rounded-full shrink-0 object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="rounded-full flex items-center justify-center font-bold shrink-0 text-white"
      style={{ width: size, height: size, fontSize: size * 0.34, background: "var(--grad)" }}
    >
      {text}
    </span>
  );
}
