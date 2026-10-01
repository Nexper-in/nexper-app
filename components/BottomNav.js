"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Receipt, Wallet, Menu } from "lucide-react";
import { useShop } from "@/components/ShopContext";

const TABS = [
  { href: "/dashboard", key: "dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/inventory", key: "inventory", label: "Stock", icon: Package },
  { href: "/billing", key: "billing", label: "New bill", icon: Receipt, primary: true },
  { href: "/credit", key: "credit", label: "Udhaar", icon: Wallet },
];

const TEXT_FIELD = "input, textarea, select, [contenteditable='true']";

export default function BottomNav({ onMore }) {
  const { activeShop, hasPermission } = useShop();
  const pathname = usePathname();
  const [typing, setTyping] = useState(false);

  // Phone keyboards push fixed bars up over the field being typed in.
  useEffect(() => {
    const onIn = (e) => setTyping(Boolean(e.target?.matches?.(TEXT_FIELD)));
    const onOut = () => setTimeout(() => setTyping(Boolean(document.activeElement?.matches?.(TEXT_FIELD))), 0);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  if (!activeShop || typing) return null;

  const enabled = activeShop.enabled_modules;
  const tabs = TABS.filter((t) => (!enabled || enabled.includes(t.key)) && hasPermission(t.key));

  return (
    <nav className="ks-no-print ks-bottom-nav" aria-label="Main">
      {tabs.map(({ href, label, icon: Icon, primary }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        if (primary) {
          return (
            <Link key={href} href={href} className={`ks-bottom-tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="ks-bottom-fab">
                <Icon size={22} />
              </span>
              {label}
            </Link>
          );
        }
        return (
          <Link key={href} href={href} className={`ks-bottom-tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon size={21} />
            {label}
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className="ks-bottom-tab">
        <Menu size={21} />
        More
      </button>
    </nav>
  );
}
