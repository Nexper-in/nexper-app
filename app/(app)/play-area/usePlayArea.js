"use client";

import { useCallback, useEffect, useState } from "react";
import { useShop } from "@/components/ShopContext";
import { useT, T } from "@/lib/i18n";

const TYPES = [
  { id: "carrom", label: T("Carrom") },
  { id: "snooker", label: T("Snooker") },
  { id: "chess", label: T("Chess") },
  { id: "video_game", label: T("Video game") },
  { id: "other", label: T("Other") },
];

// Rounded up to the minute, same rule as the database (stop_game_session),
// so what a staff member sees ticking up matches what gets charged.
function estimateAmount(startedAt, hourlyRate) {
  const minutes = Math.max(1, Math.ceil((Date.now() - new Date(startedAt).getTime()) / 60000));
  return Math.round(((minutes * hourlyRate) / 60) * 100) / 100;
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
    const [st, se] = await Promise.all([
      supabase.from("game_stations").select("*").eq("shop_id", activeShopId).order("name"),
      supabase.from("game_sessions").select("*").eq("shop_id", activeShopId).is("stopped_at", null),
    ]);
    const firstError = st.error || se.error;
    if (firstError) {
      setError(/game_stations|game_sessions|schema cache|does not exist/i.test(firstError.message) ? "setup" : firstError.message);
    } else {
      setError("");
    }
    setStations(st.data || []);
    setRunning(se.data || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeStations = stations.filter((s) => s.active);
  const runningByStation = new Map(running.map((s) => [s.station_id, s]));

  const cards = activeStations.map((s) => {
    const session = runningByStation.get(s.id) || null;
    return {
      station: s,
      session,
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

  return {
    t, TYPES, loading, error, busy, cards,
    addStation, updateStation, startStation, stopStation,
    reload: load,
  };
}
