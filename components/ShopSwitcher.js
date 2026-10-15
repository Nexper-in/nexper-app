"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import ShopTypeIcon from "@/components/ShopTypeIcon";
import { useShop } from "@/components/ShopContext";
import { shopTypeInfo } from "@/lib/shopTypes";
import { useT } from "@/lib/i18n";

// The shop name card at the top of the side menu. For a chain it opens a list of
// the shops the person can work in; choosing one switches the whole app to it.
export default function ShopSwitcher({ onNavigate }) {
  const t = useT();
  const router = useRouter();
  const { shops, orgs, activeShop, setActiveShopId } = useShop();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const several = shops.length > 1;
  // Shops grouped by company when the person belongs to more than one (an owner who also manages
  // someone else's shops); one flat list otherwise.
  const groups = orgs.length > 1 ? orgs.map((o) => ({ id: o.id, name: o.name, shops: shops.filter((x) => x.org_id === o.id) })).filter((g) => g.shops.length) : [{ id: "all", name: "", shops }];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const card = (
    <div className="flex items-center gap-2">
      <div className="ks-sidebar-chip w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ks-sidebar-text-strong">
        <ShopTypeIcon type={activeShop.type} size={17} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-bold truncate ks-sidebar-text-strong">{activeShop.name}</p>
        <p className="text-[10px] font-medium ks-sidebar-text">{t(shopTypeInfo(activeShop.type).label)}</p>
      </div>
      {several && <ChevronDown size={15} className="ks-sidebar-text shrink-0" />}
    </div>
  );

  if (!several) return <div className="ks-sidebar-chip rounded-2xl p-3 backdrop-blur-sm">{card}</div>;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Switch shop")}
        className="ks-sidebar-chip rounded-2xl p-3 backdrop-blur-sm w-full"
      >
        {card}
      </button>
      {open && (
        <ul role="listbox" className="ks-card absolute left-0 right-0 top-[calc(100%+6px)] z-50 p-1.5 max-h-72 overflow-y-auto" style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
          {groups.map((g) => (
            <Fragment key={g.id}>
              {groups.length > 1 && (
                <li role="presentation" className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  {g.name}
                </li>
              )}
              {g.shops.map((s) => (
            <li key={s.id} role="option" aria-selected={s.id === activeShop.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (s.id !== activeShop.id) {
                    setActiveShopId(s.id);
                    router.push("/dashboard");
                  }
                  onNavigate?.();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-[var(--bg-surface-alt)]"
              >
                <ShopTypeIcon type={s.type} size={15} />
                <span className="flex-1 min-w-0 text-sm font-semibold truncate">{s.name}</span>
                {s.id === activeShop.id && <Check size={14} className="text-[var(--accent)] shrink-0" />}
              </button>
            </li>
              ))}
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
