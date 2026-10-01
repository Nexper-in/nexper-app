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
} from "lucide-react";
import { useShop } from "@/components/ShopContext";
import ShopTypeIcon from "@/components/ShopTypeIcon";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import { shopTypeInfo } from "@/lib/shopTypes";
import { isPro } from "@/lib/pricing";

// What a shopkeeper needs every hour sits at the top; everything else is
// grouped below by what it's about. Names match the bottom tab bar.
const MAIN_NAV = [
  { href: "/dashboard", key: "dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/billing", key: "billing", label: "New bill", icon: Receipt },
  { href: "/inventory", key: "inventory", label: "Stock", icon: Package },
  { href: "/credit", key: "credit", label: "Udhaar", icon: Wallet },
  { href: "/history", key: "history", label: "Bills", icon: Clock },
];

const GROUPS = [
  {
    title: "Money",
    items: [
      { href: "/dayclose", key: "dayclose", label: "Day close", icon: Calculator },
      { href: "/expenses", key: "expenses", label: "Expenses", icon: Wallet2 },
      { href: "/cashbook", key: "cashbook", label: "Cashbook", icon: BookOpen },
      { href: "/reports", key: "reports", label: "Reports & GST", icon: FileBarChart2 },
    ],
  },
  {
    title: "Stock & suppliers",
    items: [
      { href: "/suppliers", key: "suppliers", label: "Suppliers", icon: Truck, pro: true },
      { href: "/purchase-orders", key: "purchase_orders", label: "Purchase orders", icon: ClipboardList, pro: true },
      { href: "/clearance", key: "clearance", label: "Clearance offers", icon: Tag, ownerOnly: true },
      // Same "inventory" permission as Stock: batches/expiry and barcode labels.
      { href: "/inventory/config", key: "inventory", label: "Batches & barcodes", icon: SlidersHorizontal },
    ],
  },
  {
    title: "Shop",
    items: [{ href: "/staff", key: "staff", label: "Staff", icon: Users, ownerOnly: true }],
  },
];

const todayStr = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function Sidebar({ onOpenSettings, onNavigate }) {
  const { supabase, activeShop, activeShopId, isOwner, hasPermission, pendingCount } = useShop();
  const pathname = usePathname();
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

  const enabledModules = activeShop.enabled_modules || MAIN_NAV.map((i) => i.key);
  const allowed = (item) =>
    item.ownerOnly ? isOwner && enabledModules.includes(item.key) : enabledModules.includes(item.key) && hasPermission(item.key);
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
        {item.label}
        {item.pro && !isPro(activeShop) && (
          <span
            className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
          >
            PRO
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
              <p className="text-[10px] font-medium ks-sidebar-text">{shopTypeInfo(activeShop.type).label}</p>
            </div>
          </div>
        </div>
        <div className="ks-sidebar-gold-rule" />
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto ks-scroll">
        <div className="space-y-1">{mainNav.map(renderNavItem)}</div>
        {groups.map((g) => (
          <div key={g.title} className="mt-5">
            <p className="px-3.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider ks-sidebar-muted">{g.title}</p>
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
            <Sparkles size={17} /> Upgrade to Pro
          </Link>
        )}
        {isOwner && (
          <button
            onClick={onOpenSettings}
            className="ks-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold"
          >
            <Settings size={17} /> Store settings
          </button>
        )}
      </div>
    </div>
  );
}
