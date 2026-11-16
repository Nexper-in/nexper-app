"use client";

import { useCallback, useEffect, useState } from "react";
import { useShop } from "@/components/ShopContext";
import { useT, T } from "@/lib/i18n";
import { fetchShopItems } from "@/lib/products";

const TYPES = [
  { id: "carrom", label: T("Carrom") },
  { id: "snooker", label: T("Snooker") },
  { id: "chess", label: T("Chess") },
  { id: "video_game", label: T("Video game") },
  { id: "other", label: T("Other") },
];

// Rounded up to the minute, then to the nearest whole rupee -- same rules as the
// database (stop_game_session), so what a staff member sees ticking up matches
// what gets charged. Math.round is round-half-up for a positive number, same as
// Postgres's round(numeric): .5 and above goes up, below .5 stays down.
function estimateAmount(startedAt, hourlyRate) {
  const minutes = Math.max(1, Math.ceil((Date.now() - new Date(startedAt).getTime()) / 60000));
  return Math.round((minutes * hourlyRate) / 60);
}

// Stations (carrom tables, chess sets, a snooker table, game consoles...), who's
// playing right now, and starting/stopping a session. One layout for phone and
// laptop; the live amounts here are an estimate -- stop_game_session computes
// the number that's actually charged, server-side, the same way.
export default function usePlayArea() {
  const { supabase, activeShopId, showToast } = useShop();
  const t = useT();
  const [stations, setStations] = useState([]);
  const [running, setRunning] = useState([]); // sessions with stopped_at = null
  const [players, setPlayers] = useState([]); // game_session_players, for running sessions
  const [orders, setOrders] = useState([]); // game_session_orders not yet billed, for running sessions
  const [items, setItems] = useState([]); // the shop's catalog, for the order picker
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // station id mid Start/Stop
  const [now, setNow] = useState(Date.now()); // ticks every second for the live display

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    const [st, se, pl, or, it] = await Promise.all([
      supabase.from("game_stations").select("*").eq("shop_id", activeShopId).order("name"),
      supabase.from("game_sessions").select("*").eq("shop_id", activeShopId).is("stopped_at", null),
      // Players and orders for a running table -- only ever shown here while
      // the game is still going; once stopped, the New bill screen's Play
      // area picker is where they're reviewed and pulled into the bill.
      supabase.from("game_session_players").select("*").eq("shop_id", activeShopId),
      supabase.from("game_session_orders").select("*").eq("shop_id", activeShopId).is("bill_id", null),
      fetchShopItems(supabase, activeShopId).catch(() => []), // only needed for the order picker; a failure there shouldn't block the screen
    ]);
    const firstError = st.error || se.error || pl.error || or.error;
    if (firstError) {
      setError(/game_stations|game_sessions|game_session_players|game_session_orders|schema cache|does not exist/i.test(firstError.message) ? "setup" : firstError.message);
    } else {
      setError("");
    }
    setStations(st.data || []);
    setRunning(se.data || []);
    setPlayers(pl.data || []);
    setOrders(or.data || []);
    setItems(it || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeStations = stations.filter((s) => s.active);
  const runningByStation = new Map(running.map((s) => [s.station_id, s]));

  const playersBySession = new Map();
  for (const p of players) {
    const arr = playersBySession.get(p.session_id) || [];
    arr.push(p);
    playersBySession.set(p.session_id, arr);
  }
  const ordersBySession = new Map();
  for (const o of orders) {
    const arr = ordersBySession.get(o.session_id) || [];
    arr.push(o);
    ordersBySession.set(o.session_id, arr);
  }

  const cards = activeStations.map((s) => {
    const session = runningByStation.get(s.id) || null;
    return {
      station: s,
      session,
      players: session ? playersBySession.get(session.id) || [] : [],
      orders: session ? ordersBySession.get(session.id) || [] : [],
      elapsedSeconds: session ? Math.floor((now - new Date(session.started_at).getTime()) / 1000) : 0,
      estimate: session ? estimateAmount(session.started_at, Number(s.hourly_rate)) : 0,
    };
  });

  async function addStation(fields) {
    const { data, error: err } = await supabase
      .from("game_stations")
      .insert({ shop_id: activeShopId, name: fields.name.trim(), type: fields.type, hourly_rate: fields.hourly_rate })
      .select()
      .single();
    if (err) throw new Error(err.code === "23505" ? t("You already have a station with that name.") : err.message);
    setStations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function updateStation(id, fields) {
    const { data, error: err } = await supabase.from("game_stations").update(fields).eq("id", id).select().single();
    if (err) throw new Error(err.code === "23505" ? t("You already have a station with that name.") : err.message);
    setStations((prev) => prev.map((s) => (s.id === id ? data : s)));
  }

  async function startStation(stationId) {
    setBusy(stationId);
    try {
      const { data, error: err } = await supabase.rpc("start_game_session", { p_station: stationId });
      if (err) throw err;
      setRunning((prev) => [...prev, data]);
    } catch (e) {
      showToast(e.message || t("Couldn't start — try again"), "err");
    }
    setBusy(null);
  }

  // Returns the stopped session (with its final amount) so the caller can
  // offer to add it to a bill right away.
  async function stopStation(stationId) {
    const session = runningByStation.get(stationId);
    if (!session) return null;
    setBusy(stationId);
    let stopped = null;
    try {
      const { data, error: err } = await supabase.rpc("stop_game_session", { p_session: session.id });
      if (err) throw err;
      stopped = data;
      setRunning((prev) => prev.filter((s) => s.id !== session.id));
    } catch (e) {
      showToast(e.message || t("Couldn't stop — try again"), "err");
    }
    setBusy(null);
    return stopped;
  }

  // Tags a player under a running table. Name is required; phone is optional
  // (it's kept only to know who was at the table, not used for anything else yet).
  async function addPlayer(sessionId, { name, phone }) {
    const { data, error: err } = await supabase
      .from("game_session_players")
      .insert({ shop_id: activeShopId, session_id: sessionId, name: name.trim(), phone: phone?.trim() || null })
      .select()
      .single();
    if (err) throw new Error(err.message);
    setPlayers((prev) => [...prev, data]);
    return data;
  }

  // Removes a player's name tag from the table. Anything they already ordered
  // stays on the bill -- it just goes back to being a shared/unattributed line
  // instead of being lost, in case someone was tagged by mistake.
  async function removePlayer(playerId) {
    try {
      const { error: unassignErr } = await supabase
        .from("game_session_orders")
        .update({ player_id: null })
        .eq("player_id", playerId)
        .is("bill_id", null);
      if (unassignErr) throw unassignErr;
      const { error: err } = await supabase.from("game_session_players").delete().eq("id", playerId);
      if (err) throw err;
      setOrders((prev) => prev.map((o) => (o.player_id === playerId ? { ...o, player_id: null } : o)));
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    } catch (e) {
      showToast(e.message || t("Couldn't remove — try again"), "err");
    }
  }

  // Adds one catalog item to a session, optionally tagged to a player (null = shared,
  // e.g. a jug of water the whole table drinks from). Tapping the same item again for
  // the same player just adds to that line's quantity, same as the New bill quick
  // tiles, instead of piling up separate rows. Stock isn't touched here -- it's
  // deducted later, like any other line, once the session's orders are billed.
  async function addOrder(sessionId, playerId, item, qty = 1) {
    const existing = orders.find(
      (o) => o.session_id === sessionId && (o.player_id || null) === (playerId || null) && o.shop_product_id === item.id
    );
    if (existing) {
      const { data, error: err } = await supabase
        .from("game_session_orders")
        .update({ qty: Number(existing.qty) + qty })
        .eq("id", existing.id)
        .select()
        .single();
      if (err) throw new Error(err.message);
      setOrders((prev) => prev.map((o) => (o.id === existing.id ? data : o)));
      return data;
    }
    const { data, error: err } = await supabase
      .from("game_session_orders")
      .insert({
        shop_id: activeShopId,
        session_id: sessionId,
        player_id: playerId || null,
        shop_product_id: item.id,
        name: item.name,
        price: item.price,
        gst: item.gst || 0,
        qty,
      })
      .select()
      .single();
    if (err) throw new Error(err.message);
    setOrders((prev) => [...prev, data]);
    return data;
  }

  // Removes an order that hasn't been billed yet (a tap added the wrong thing).
  // Once it's on a bill, RLS simply won't let the delete through.
  async function removeOrder(orderId) {
    try {
      const { error: err } = await supabase.from("game_session_orders").delete().eq("id", orderId);
      if (err) throw err;
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (e) {
      showToast(e.message || t("Couldn't remove — try again"), "err");
    }
  }

  return {
    t, TYPES, loading, error, busy, cards, items,
    addStation, updateStation, startStation, stopStation,
    addPlayer, removePlayer, addOrder, removeOrder,
    reload: load,
  };
}
