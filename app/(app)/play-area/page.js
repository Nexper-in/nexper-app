"use client";

import { useState } from "react";
import { Loader2, Play, Square, Pencil, Plus, Gamepad2 } from "lucide-react";
import ModuleGuard from "@/components/ModuleGuard";
import Modal from "@/components/ui/Modal";
import { rupee } from "@/lib/format";
import { useT } from "@/lib/i18n";
import usePlayArea from "./usePlayArea";
import { clock, StationModal } from "./PlayAreaParts";

// Play area: carrom, snooker, chess, video game consoles — anything a tea shop
// or canteen rents out by the hour. One grid of stations, each either idle or
// running with a live ticking amount. One layout for phone and laptop.
export default function PlayAreaPage() {
  return (
    <ModuleGuard module="play_area" feature="play_area">
      <PlayAreaScreen />
    </ModuleGuard>
  );
}

function PlayAreaScreen() {
  const t = useT();
  const vm = usePlayArea();
  const [stationModal, setStationModal] = useState(null); // { station? }
  const [justStopped, setJustStopped] = useState(null); // { name, amount }

  if (vm.loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading…")}
      </div>
    );
  }

  if (vm.error) {
    return (
      <div className="pt-4">
        <div className="ks-card p-5 text-sm">
          {vm.error === "setup"
            ? t("Play area needs a database update first. Ask whoever looks after your setup to run update 047.")
            : t("Something went wrong. Try again.")}
        </div>
      </div>
    );
  }

  async function onStop(stationId, name) {
    const stopped = await vm.stopStation(stationId);
    if (stopped) setJustStopped({ name, amount: Number(stopped.amount) });
  }

  return (
    <div className="pt-4">
      <div className="flex items-baseline justify-between mb-3">
        <h1 className="ks-display font-bold text-xl">{t("Play area")}</h1>
        <button onClick={() => setStationModal({})} className="ks-btn-outline text-sm flex items-center gap-1.5 py-2 px-3">
          <Plus size={15} /> {t("Add station")}
        </button>
      </div>

      {vm.cards.length === 0 ? (
        <div className="ks-card p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          <Gamepad2 size={28} className="mx-auto mb-2 opacity-60" />
          {t("No stations yet — add a carrom table, chess set, snooker table or game console to get started.")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vm.cards.map(({ station, session, elapsedSeconds, estimate }) => (
            <div key={station.id} className="ks-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold">{station.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {t(vm.TYPES.find((ty) => ty.id === station.type)?.label || station.type)} · {rupee(station.hourly_rate)}/{t("hr")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStationModal({ station })}
                  aria-label={t("Edit {name}", { name: station.name })}
                  className="ks-btn-outline w-9 h-9 !p-0 flex items-center justify-center shrink-0"
                >
                  <Pencil size={14} />
                </button>
              </div>

              {session ? (
                <>
                  <div className="ks-mono text-3xl font-extrabold text-center py-2" style={{ color: "var(--accent-soft-text)" }}>
                    {clock(elapsedSeconds)}
                  </div>
                  <p className="text-center text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
                    {t("so far")} <span className="font-semibold">{rupee(estimate)}</span>
                  </p>
                  <button
                    disabled={vm.busy === station.id}
                    onClick={() => onStop(station.id, station.name)}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                    style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                  >
                    {vm.busy === station.id ? <Loader2 size={15} className="animate-spin" /> : <Square size={15} />} {t("Stop")}
                  </button>
                </>
              ) : (
                <button
                  disabled={vm.busy === station.id}
                  onClick={() => vm.startStation(station.id)}
                  className="ks-btn-primary w-full mt-2 flex items-center justify-center gap-2"
                >
                  {vm.busy === station.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {t("Start")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {stationModal && (
        <StationModal
          station={stationModal.station}
          types={vm.TYPES}
          onClose={() => setStationModal(null)}
          onSave={(fields) => (stationModal.station ? vm.updateStation(stationModal.station.id, fields) : vm.addStation(fields))}
        />
      )}

      {justStopped && (
        <Modal title={t("Session stopped")} onClose={() => setJustStopped(null)}>
          <div className="text-center py-2">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{justStopped.name}</p>
            <p className="ks-display text-3xl font-extrabold ks-mono my-2">{rupee(justStopped.amount)}</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("Add it to the customer's bill from the New bill screen — look for \"Play area\".")}
            </p>
            <button onClick={() => setJustStopped(null)} className="ks-btn-primary w-full mt-4">{t("Done")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
