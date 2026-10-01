"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  Clock,
  Wallet,
  Calculator,
  Wallet2,
  BookOpen,
  Truck,
  Users,
  Settings,
  Tag,
  ClipboardList,
  SlidersHorizontal,
  FileBarChart2,
  Sparkles,
  CalendarClock,
  Megaphone,
} from "lucide-react";
import { useShop } from "@/components/ShopContext";
import { T, useT } from "@/lib/i18n";
import ShopTypeIcon from "@/components/ShopTypeIcon";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import { shopTypeInfo } from "@/lib/shopTypes";
import { isPro } from "@/lib/pricing";
import { hasFeature } from "@/lib/platformConfig";
import { isModuleEnabled } from "@/lib/modules";

// What a shopkeeper needs every hour sits at the top; everything else is
// grouped below by what it's about. Names match the bottom tab bar.
const MAIN_NAV = [
  { href: "/dashboard", key: "dashboard", label: T("Home"), icon: LayoutDashboard },
  { href: "/billing", key: "billing", label: T("New bill"), icon: Receipt },
  { href: "/inventory", key: "inventory", label: T("Stock"), icon: Package },
  { href: "/credit", key: "credit", label: T("Udhaar"), icon: Wallet },
  { href: "/history", key: "history", label: T("Bills"), icon: Clock },
];

const GROUPS = [
  {
    title: T("Money"),
    items: [
      { href: "/dayclose", key: "dayclose", label: T("Day close"), icon: Calculator },
      { href: "/expenses", key: "expenses", label: T("Expenses"), icon: Wallet2 },
      { href: "/cashbook", key: "cashbook", label: T("Cashbook"), icon: BookOpen },
      { href: "/reports", key: "reports", label: T("Reports & GST"), icon: FileBarChart2 },
    ],
  },
  {
    title: T("Stock & suppliers"),
    items: [
      { href: "/suppliers", key: "suppliers", label: T("Suppliers"), icon: Truck, pro: true },
      { href: "/purchase-orders", key: "purchase_orders", label: T("Purchase orders"), icon: ClipboardList, pro: true },
      { href: "/expiry", key: "inventory", label: T("Expiry"), icon: CalendarClock, feature: "expiry" },
      { href: "/clearance", key: "clearance", label: T("Clearance offers"), icon: Tag, ownerOnly: true },
      { href: "/offers", key: "clearance", label: T("Offers & group"), icon: Megaphone, ownerOnly: true, feature: "offers_group" },
      // Same "inventory" permission as Stock: batches/expiry and barcode labels.
      { href: "/inventory/config", key: "inventory", label: T("Batches & barcodes"), icon: SlidersHorizontal },
    ],
  },
  {
    title: T("Shop"),
    items: [{ href: "/staff", key: "staff", label: T("Staff"), icon: Users, ownerOnly: true }],
  },
];

const todayStr = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function Sidebar({ onOpenSettings, onNavigate }) {
  const { supabase, activeShop, activeShopId, isOwner, hasPermission, pendingCount } = useShop();
  const pathname = usePathname();
  const t = useT();
  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    if (!activeShopId) return;
    let active = true;
    supabase
      .from("shop_products")
      .select("stock, low_at")
      .eq("shop_id", activeShopId)
      .then(({ data }) => {
        if (!active || !data) return;
        setLowStockCount(data.filter((i) => i.stock <= i.low_at).length);
      });
    return () => {
      active = false;
    };
  }, [supabase, activeShopId]);

  if (!activeShop) return null;

  const allowed = (item) =>
    (!item.feature || hasFeature(activeShop, item.feature)) &&
    (item.ownerOnly ? isOwner && isModuleEnabled(activeShop, item.key) : isModuleEnabled(activeShop, item.key) && hasPermission(item.key));
  const mainNav = MAIN_NAV.filter(allowed);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);

  function renderNavItem(item) {
    const Icon = item.icon;
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => onNavigate?.()}
        className={`ks-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${active ? "active" : ""}`}
      >
        <Icon size={17} />
        {t(item.label)}
        {item.pro && !hasFeature(activeShop, "purchase_orders") && (
          <span
            className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
          >
            {t("PRO")}
          </span>
        )}
        {item.href === "/inventory" && lowStockCount > 0 && (
          <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--danger-solid)] text-white text-[10px] font-bold">
            {lowStockCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="h-full flex flex-col ks-sidebar">
      <div className="p-4 space-y-3">
        <Link href="/dashboard" onClick={() => onNavigate?.()} className="block px-1 pt-1 pb-1 text-[26px] ks-wordmark ks-sidebar-text-strong">
          Ne<span className="ks-grad-text">x</span>per
        </Link>
        <div className="ks-sidebar-chip rounded-2xl p-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="ks-sidebar-chip w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ks-sidebar-text-strong">
              <ShopTypeIcon type={activeShop.type} size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate ks-sidebar-text-strong">{activeShop.name}</p>
              <p className="text-[10px] font-medium ks-sidebar-text">{t(shopTypeInfo(activeShop.type).label)}</p>
            </div>
          </div>
        </div>
        <div className="ks-sidebar-gold-rule" />
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto ks-scroll">
        <div className="space-y-1">{mainNav.map(renderNavItem)}</div>
        {groups.map((g) => (
          <div key={g.title} className="mt-5">
            <p className="px-3.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider ks-sidebar-muted">{t(g.title)}</p>
            <div className="space-y-1">{g.items.map(renderNavItem)}</div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t ks-sidebar-border">
        {pendingCount > 0 && (
          <div className="px-3.5 pb-2">
            <SyncStatusBadge pendingCount={pendingCount} />
          </div>
        )}
        <div className="ks-mono text-[10px] ks-sidebar-muted px-3.5 pb-2">{todayStr()}</div>
        {isOwner && !isPro(activeShop) && (
          <Link
            href="/upgrade"
            onClick={() => onNavigate?.()}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold mb-1"
            style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
          >
            <Sparkles size={17} /> {t("Upgrade to Pro")}
          </Link>
        )}
        {isOwner && (
          <button
            onClick={onOpenSettings}
            className="ks-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold"
          >
            <Settings size={17} /> {t("Store settings")}
          </button>
        )}
      </div>
    </div>
  );
}
