"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { seedItemsForShop } from "@/lib/shopTypes";
import { defaultPermissions, defaultModulesForType } from "@/lib/modules";
import { useOfflineQueue } from "@/lib/offlineQueue";
import { callApi } from "@/lib/apiClient";
import { setPlatformConfig } from "@/lib/platformConfig";
import { copyCatalog } from "@/lib/branch";
import { pickOrgInfo } from "@/lib/orgInfo";

const ShopContext = createContext(null);

const ACTIVE_SHOP_KEY = "nexper.activeShopId";

export function ShopProvider({ children }) {
  const [supabase] = useState(() => createClient());
  const [shops, setShops] = useState([]);
  const [activeShopId, setActiveShopIdState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);
  const [currentMember, setCurrentMember] = useState(null);
  // The company (chain) the signed-in user belongs to and their role in it:
  // { org: { id, name, max_shops }, role }. undefined: not loaded yet;
  // null: no company (before database update 035).
  const [orgData, setOrgData] = useState(undefined); // { orgs, roles } or null before update 035
  // Shops the owner closed (read-only, can be reopened any time; migration 037)
  const [closedShops, setClosedShops] = useState([]);
  // Platform admin settings (prices, plans, switches, announcement) and this
  // shop's own admin controls (plan override, limits, feature overrides).
  const [platform, setPlatform] = useState(() => setPlatformConfig([]));
  const [controls, setControls] = useState({});
  // The active shop's company controls (plan, limits, overrides; migration 039), by company
  const [orgControls, setOrgControls] = useState({});
  const { run: runQueued, pendingCount } = useOfflineQueue(supabase);

  const showToast = useCallback((msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2200);
  }, []);

  const loadShops = useCallback(async () => {
    // RLS now scopes this to shops the signed-in user is a member of —
    // owner or staff — not just shops they own.
    const { data, error } = await supabase.from("shops").select("*").order("created_at", { ascending: true });
    if (!error) {
      const all = data || [];
      const open = all.filter((s) => s.status !== "closed");
      setShops(open);
      setClosedShops(all.filter((s) => s.status === "closed"));
      setActiveShopIdState((prev) => {
        if (prev && all.some((s) => s.id === prev)) return prev;
        const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_SHOP_KEY) : null;
        if (stored && all.some((s) => s.id === stored)) return stored;
        return open[0]?.id ?? all[0]?.id ?? null;
      });
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadShops();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, [loadShops, supabase]);

  const loadPlatform = useCallback(async () => {
    const { data } = await supabase.from("platform_settings").select("key, value");
    setPlatform(setPlatformConfig(data || []));
  }, [supabase]);

  useEffect(() => {
    loadPlatform();
  }, [loadPlatform]);

  useEffect(() => {
    if (!activeShopId) return;
    let live = true;
    supabase
      .from("tenant_controls")
      .select("*")
      .eq("shop_id", activeShopId)
      .maybeSingle()
      .then(({ data }) => live && setControls((c) => ({ ...c, [activeShopId]: data || null })));
    return () => {
      live = false;
    };
  }, [supabase, activeShopId]);

  const activeOrgId = (shops.find((x) => x.id === activeShopId) || closedShops.find((x) => x.id === activeShopId))?.org_id || null;
  useEffect(() => {
    if (!activeOrgId) return;
    let live = true;
    supabase
      .from("org_controls")
      .select("*")
      .eq("org_id", activeOrgId)
      .maybeSingle()
      .then(({ data, error }) => live && !error && setOrgControls((c) => ({ ...c, [activeOrgId]: data || null })));
    return () => {
      live = false;
    };
  }, [supabase, activeOrgId]);

  // Which shop_members row (role + permissions) the signed-in user holds
  // for the active shop — drives nav filtering and action gating.
  useEffect(() => {
    if (!activeShopId || !user) {
      setCurrentMember(null);
      return;
    }
    let active = true;
    supabase
      .from("shop_members")
      .select("*")
      .eq("shop_id", activeShopId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setCurrentMember(data ?? null);
      });
    return () => {
      active = false;
    };
  }, [supabase, activeShopId, user]);

  // Every company the person belongs to, and their role in each. Quietly nothing before update 035.
  const loadOrg = useCallback(async () => {
    if (!user) return setOrgData(undefined);
    const { data: orgs, error } = await supabase.from("organisations").select("*").order("created_at").limit(50);
    if (error || !orgs?.length) return setOrgData(null);
    const { data: mine } = await supabase.from("org_members").select("org_id, role, shop_ids").eq("user_id", user.id);
    setOrgData({ orgs, roles: Object.fromEntries((mine || []).map((m) => [m.org_id, { role: m.role, shopIds: m.shop_ids || [] }])) });
  }, [supabase, user]);

  useEffect(() => {
    loadOrg();
  }, [loadOrg, shops.length]);

  // The company of the shop that is open now, and the person's role in IT (not in some other
  // company they also belong to).
  const orgInfo = useMemo(() => pickOrgInfo(orgData, shops, closedShops, activeShopId), [orgData, shops, closedShops, activeShopId]);

  async function updateProfile(fields) {
    const { data, error } = await supabase.auth.updateUser({ data: fields });
    if (error) throw error;
    setUser(data.user);
    return data.user;
  }

  function setActiveShopId(id) {
    setActiveShopIdState(id);
    if (typeof window === "undefined") return;
    if (id) localStorage.setItem(ACTIVE_SHOP_KEY, id);
    else localStorage.removeItem(ACTIVE_SHOP_KEY);
  }

  async function callStaffApi(path, body) {
    return callApi(supabase, path, body);
  }

  // A new shop starts empty by default — the owner adds their own items via
  // Inventory. seedTemplate opts into pre-filling a generic starter catalog
  // for the business type instead of typing everything in by hand.
  async function addShop(name, type, { seedTemplate = false, copyFromShopId = null } = {}) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");

    const { data: shop, error } = await supabase
      .from("shops")
      .insert({ owner_id: user.id, name, type, ...(defaultModulesForType(type) ? { enabled_modules: defaultModulesForType(type) } : {}) })
      .select()
      .single();
    if (error) throw error;

    const { error: memberError } = await supabase.from("shop_members").insert({
      shop_id: shop.id,
      user_id: user.id,
      role: "owner",
      name: user.user_metadata?.full_name || "Owner",
      permissions: defaultPermissions(true),
    });
    if (memberError) throw memberError;

    if (seedTemplate) {
      const seedItems = seedItemsForShop(type);
      if (seedItems.length > 0) {
        // Seed items split across the owner-level `products` catalog and this
        // shop's `shop_products` price/stock instance of each — see
        // PROJECT_BRIEF.md's shared-catalog note.
        const productRows = seedItems.map(({ code, price, cost_price, gst, stock, low_at, quick, ...product }) => ({
          ...product,
          owner_id: user.id,
        }));
        const { data: products, error: productError } = await supabase.from("products").insert(productRows).select();
        if (productError) throw productError;

        const shopProductRows = seedItems.map((it, i) => ({
          shop_id: shop.id,
          product_id: products[i].id,
          code: it.code,
          price: it.price,
          cost_price: it.cost_price,
          gst: it.gst,
          stock: it.stock,
          low_at: it.low_at,
          quick: it.quick,
        }));
        const { error: seedError } = await supabase.from("shop_products").insert(shopProductRows);
        if (seedError) throw seedError;
      }
    }

    // A branch of a chain can start with another shop's item list.
    if (copyFromShopId) await copyCatalog(supabase, copyFromShopId, shop.id);

    setShops((prev) => [...prev, shop]);
    setActiveShopId(shop.id);
    showToast(`${name} created`);
    return shop;
  }

  async function updateActiveShop(fields) {
    if (!activeShopId) return;
    const { data, error } = await supabase.from("shops").update(fields).eq("id", activeShopId).select().single();
    if (error) throw error;
    setShops((prev) => prev.map((s) => (s.id === activeShopId ? data : s)));
    return data;
  }

  // Closing is not deleting: the shop becomes read-only, staff and company roles lose access,
  // and the owner can download everything or reopen it any time (migration 037).
  async function closeActiveShop(reason) {
    if (!activeShopId) return;
    const { error } = await supabase.rpc("close_shop", { p_shop: activeShopId, p_reason: reason || null });
    if (error) throw new Error(/function|schema cache/i.test(error.message) ? "This needs the latest database update." : error.message);
    const remaining = shops.filter((s) => s.id !== activeShopId);
    setActiveShopId(remaining[0]?.id ?? null);
    await loadShops();
  }

  async function reopenShop(shopId) {
    const { error } = await supabase.rpc("reopen_shop", { p_shop: shopId });
    if (error) throw new Error(/function|schema cache/i.test(error.message) ? "This needs the latest database update." : error.message);
    await loadShops();
    setActiveShopId(shopId);
  }

  const baseShop = shops.find((s) => s.id === activeShopId) || closedShops.find((s) => s.id === activeShopId) || null;
  const activeShop = useMemo(
    () => (baseShop ? { ...baseShop, controls: controls[baseShop.id] || null, orgControls: orgControls[baseShop.org_id] || null } : null),
    [baseShop, controls, orgControls]
  );
  const isOwner = currentMember?.role === "owner";
  // Company-level roles: the owner and managers see the Company screen.
  const orgRole = orgInfo?.role || null;
  const isOrgOwner = orgRole === "owner";
  const canSeeCompany = orgRole === "owner" || orgRole === "manager";
  function hasPermission(moduleKey) {
    if (!currentMember) return false;
    if (currentMember.role === "owner") return true;
    return !!currentMember.permissions?.[moduleKey];
  }

  return (
    <ShopContext.Provider
      value={{
        supabase,
        shops,
        closedShops,
        activeShop,
        platform,
        activeShopId,
        setActiveShopId,
        addShop,
        updateActiveShop,
        closeActiveShop,
        reopenShop,
        loading,
        reload: loadShops,
        toast,
        showToast,
        user,
        updateProfile,
        currentMember,
        isOwner,
        orgInfo,
        orgs: orgData?.orgs || [],
        orgRole,
        isOrgOwner,
        canSeeCompany,
        reloadOrg: loadOrg,
        hasPermission,
        callStaffApi,
        runQueued,
        pendingCount,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within a ShopProvider");
  return ctx;
}
