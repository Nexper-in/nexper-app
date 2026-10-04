"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useShop } from "@/components/ShopContext";
import { useT } from "@/lib/i18n";
import {
  todayISO, addDays, cellKey, qtyMapFromEntries, diffRound, roundTotals,
  buildStatement, withBalances,
} from "@/lib/supplies";

const MAX_ITEMS = 8;
const PAGE = 1000;

// Reads every page of a query (the API returns at most 1000 rows at a time).
async function fetchAll(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// Everything the Supplies screen knows and does: the places supplied
// (departments), the day's round, accounts and statements.
export default function useSupplies() {
  const { supabase, activeShopId, activeShop, showToast } = useShop();
  const t = useT();
  const [today] = useState(() => todayISO());
  const [date, setDate] = useState(today);
  const [points, setPoints] = useState([]);
  const [items, setItems] = useState([]);
  const [balances, setBalances] = useState([]);
  const [saved, setSaved] = useState({});
  const [edited, setEdited] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadBase = useCallback(async () => {
    if (!activeShopId) return;
    const [pts, prods, bal] = await Promise.all([
      supabase.from("supply_points").select("*").eq("shop_id", activeShopId).order("name"),
      supabase.from("shop_products").select("id, price, quick, product:products(name)").eq("shop_id", activeShopId),
      supabase.rpc("supply_balances", { p_shop: activeShopId }),
    ]);
    const firstError = pts.error || prods.error || bal.error;
    if (firstError) {
      // The tables arrive with database update 030; say so instead of a blank screen.
      setError(/supply_|schema cache|does not exist/i.test(firstError.message) ? "setup" : firstError.message);
    } else {
      setError("");
    }
    setPoints(pts.data || []);
    const all = (prods.data || []).map((p) => ({ id: p.id, name: p.product?.name || "", price: Number(p.price), quick: p.quick }));
    const quick = all.filter((p) => p.quick);
    // Items shown in the round: the ones marked quick, else the first few.
    setItems((quick.length ? quick : all).sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ITEMS));
    setBalances(bal.data || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  const loadDay = useCallback(async () => {
    if (!activeShopId) return;
    setLoadingDay(true);
    try {
      const rows = await fetchAll(() =>
        supabase.from("supply_entries").select("point_id, shop_product_id, qty").eq("shop_id", activeShopId).eq("entry_date", date)
      );
      const map = qtyMapFromEntries(rows);
      setSaved(map);
      setEdited(map);
    } catch {
      /* the base load already shows the setup message */
    }
    setLoadingDay(false);
  }, [supabase, activeShopId, date]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);
  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const activePoints = useMemo(() => points.filter((p) => p.active), [points]);
  const accounts = useMemo(() => withBalances(points, balances), [points, balances]);
  const dirtyRows = useMemo(() => diffRound(saved, edited), [saved, edited]);
  const dirty = dirtyRows.length > 0;
  const totals = useMemo(() => roundTotals(items, edited), [items, edited]);
  const totalDue = accounts.reduce((s, a) => s + Math.max(a.balance, 0), 0);

  function setQty(pointId, itemId, qty) {
    const q = Math.max(0, Math.min(10000, Math.floor(Number(qty) || 0)));
    setEdited((prev) => {
      const next = { ...prev };
      const k = cellKey(pointId, itemId);
      if (q === 0) delete next[k];
      else next[k] = q;
      return next;
    });
  }
  const bump = (pointId, itemId, by) => setQty(pointId, itemId, (edited[cellKey(pointId, itemId)] || 0) + by);

  function changeDate(next) {
    if (next === date) return;
    if (dirty && !window.confirm(t("You have unsaved entries. Discard them?"))) return;
    setDate(next);
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc("save_supply_round", { p_shop: activeShopId, p_date: date, p_rows: dirtyRows });
      if (err) throw err;
      setSaved(edited);
      showToast(t("Saved"));
      const bal = await supabase.rpc("supply_balances", { p_shop: activeShopId });
      setBalances(bal.data || []);
    } catch (e) {
      showToast(
        typeof navigator !== "undefined" && navigator.onLine === false
          ? t("No internet. Your entries are still here: save again when you are back online.")
          : t("Couldn't save. Your entries are still here: try again.")
      );
    }
    setSaving(false);
  }

  // Fill empty cells from the day before (rounds repeat from day to day).
  async function copyPrevious() {
    try {
      const rows = await fetchAll(() =>
        supabase.from("supply_entries").select("point_id, shop_product_id, qty").eq("shop_id", activeShopId).eq("entry_date", addDays(date, -1))
      );
      const prev = qtyMapFromEntries(rows);
      if (!Object.keys(prev).length) return showToast(t("Nothing was recorded the day before."));
      setEdited((cur) => ({ ...prev, ...cur }));
    } catch {
      showToast(t("Couldn't load the day before."));
    }
  }

  async function addPoint(name, phone) {
    const { data, error: err } = await supabase
      .from("supply_points")
      .insert({ shop_id: activeShopId, name: name.trim(), phone: phone?.trim() || null })
      .select()
      .single();
    if (err) throw new Error(err.code === "23505" ? t("You already have a department with that name.") : err.message);
    setPoints((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data;
  }

  async function updatePoint(id, fields) {
    const { data, error: err } = await supabase.from("supply_points").update(fields).eq("id", id).select().single();
    if (err) throw new Error(err.code === "23505" ? t("You already have a department with that name.") : err.message);
    setPoints((prev) => prev.map((p) => (p.id === id ? data : p)));
  }

  async function addPayment(pointId, { amount, paid_on, method, note }) {
    const { error: err } = await supabase
      .from("supply_payments")
      .insert({ shop_id: activeShopId, point_id: pointId, amount, paid_on, method, note: note || null });
    if (err) throw new Error(err.message);
    const bal = await supabase.rpc("supply_balances", { p_shop: activeShopId });
    setBalances(bal.data || []);
    showToast(t("Payment recorded"));
  }

  async function deletePayment(id) {
    const { error: err } = await supabase.from("supply_payments").delete().eq("id", id);
    if (err) throw new Error(err.message);
    const bal = await supabase.rpc("supply_balances", { p_shop: activeShopId });
    setBalances(bal.data || []);
  }

  async function loadStatement(pointId, from, to) {
    const [entries, payments, opening] = await Promise.all([
      fetchAll(() =>
        supabase.from("supply_entries").select("entry_date, item_name, qty, unit_price").eq("point_id", pointId)
          .gte("entry_date", from).lte("entry_date", to).order("entry_date")
      ),
      fetchAll(() =>
        supabase.from("supply_payments").select("id, amount, paid_on, method, note").eq("point_id", pointId)
          .gte("paid_on", from).lte("paid_on", to).order("paid_on")
      ),
      supabase.rpc("supply_opening", { p_point: pointId, p_before: from }),
    ]);
    if (opening.error) throw opening.error;
    return buildStatement({ entries, payments, opening: opening.data, from, to });
  }

  return {
    supabase, activeShop, today, date, changeDate,
    points, activePoints, items, accounts, totalDue,
    edited, totals, dirty, dirtyRows, setQty, bump,
    loading, loadingDay, saving, error,
    save, copyPrevious, addPoint, updatePoint, addPayment, deletePayment, loadStatement,
    reload: loadBase,
  };
}
