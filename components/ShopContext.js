"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { seedItemsForShop } from "@/lib/shopTypes";
import { defaultPermissions, defaultModulesForType } from "@/lib/modules";
import { useOfflineQueue } from "@/lib/offlineQueue";
import { callApi } from "@/lib/apiClient";
import { setPlatformConfig } from "@/lib/platformConfig";

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
  // Platform admin settings (prices, plans, switches, announcement) and this
  // shop's own admin controls (plan override, limits, feature overrides).
  const [platform, setPlatform] = useState(() => setPlatformConfig([]));
  const [controls, setControls] = useState({});
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
      setShops(data || []);
      setActiveShopIdState((prev) => {
        if (prev && data.some((s) => s.id === prev)) return prev;
        const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_SHOP_KEY) : null;
        if (stored && data.some((s) => s.id === stored)) return stored;
        return data[0]?.id ?? null;
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
  async function addShop(name, type, { seedTemplate = false } = {}) {
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

  // Permanently deletes the shop and everything under it (items, bills,
  // movements, credits, day-close history, expenses, supplier links,
  // staff) — schema.sql cascades all of that from the shops row. Leaves
  // the owner with zero shops, which sends them back to onboarding to
  // set up a new one (app/(app)/layout.js checks shops.length === 0).
  async function deleteActiveShop() {
    if (!activeShopId) return;
    const { error } = await supabase.from("shops").delete().eq("id", activeShopId);
    if (error) throw error;
    setShops([]);
    setActiveShopId(null);
  }

  const baseShop = shops.find((s) => s.id === activeShopId) || null;
  const activeShop = useMemo(() => (baseShop ? { ...baseShop, controls: controls[baseShop.id] || null } : null), [baseShop, controls]);
  const isOwner = currentMember?.role === "owner";
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
        activeShop,
        platform,
        activeShopId,
        setActiveShopId,
        addShop,
        updateActiveShop,
        deleteActiveShop,
        loading,
        reload: loadShops,
        toast,
        showToast,
        user,
        updateProfile,
        currentMember,
        isOwner,
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
