"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2, Plus, Lock } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { useShop } from "@/components/ShopContext";
import { T, useT } from "@/lib/i18n";
import { hasFeature } from "@/lib/platformConfig";
import { addPasskey, deviceHasBiometric, guessDeviceName, listPasskeys, passkeyErrorText, passkeysSupported, removePasskey } from "@/lib/passkeyClient";
import { LOCK_DELAYS, disableLock, enableLock, getLockConfig, setLockMinutes } from "@/lib/appLock";

const DELAY_LABELS = { 0: T("Every time I leave"), 1: T("After 1 minute away"), 5: T("After 5 minutes away"), 15: T("After 15 minutes away") };
const fmt = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// Two things, both about the fingerprint / Face ID / screen lock on this device:
// sign in with it instead of typing a password, and lock the app with it.
export default function PasskeyModal({ onClose }) {
  const t = useT();
  const { supabase, user, activeShop, showToast } = useShop();
  const supported = passkeysSupported();
  const [hasBio, setHasBio] = useState(null);
  const [devices, setDevices] = useState(null);
  const [name, setName] = useState(guessDeviceName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lock, setLock] = useState(null);

  const canPasskey = hasFeature(activeShop, "passkey_login");
  const canLock = hasFeature(activeShop, "app_lock");

  const reload = useCallback(async () => {
    try {
      setDevices(await listPasskeys(supabase));
    } catch (e) {
      setDevices([]);
      setError(e.message);
    }
  }, [supabase]);

  useEffect(() => {
    deviceHasBiometric().then(setHasBio);
    setLock(user ? getLockConfig(user.id) : null);
    if (supported && canPasskey) reload();
  }, [user, supported, canPasskey, reload]);

  async function add() {
    setBusy(true);
    setError("");
    try {
      await addPasskey(supabase, name.trim() || guessDeviceName());
      showToast(t("Device added"));
      await reload();
    } catch (e) {
      const msg = passkeyErrorText(e, t);
      if (msg) setError(msg);
    }
    setBusy(false);
  }

  async function remove(d) {
    if (!window.confirm(t("Remove this device?"))) return;
    try {
      await removePasskey(supabase, d.id);
      await reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleLock() {
    setError("");
    if (lock) {
      disableLock(user.id);
      setLock(null);
      return;
    }
    setBusy(true);
    try {
      await enableLock(user, 1);
      setLock(getLockConfig(user.id));
    } catch (e) {
      const msg = passkeyErrorText(e, t);
      if (msg) setError(msg);
    }
    setBusy(false);
  }

  return (
    <Modal title={t("Fingerprint / Face ID")} onClose={onClose}>
      <div className="space-y-5 text-sm">
        {!supported && <p className="text-[var(--text-secondary)]">{t("This phone or browser can't use fingerprint or Face ID.")}</p>}

        {supported && canPasskey && (
          <section className="space-y-3">
            <div>
              <h3 className="font-bold flex items-center gap-1.5"><Fingerprint size={15} /> {t("Sign in with this device")}</h3>
              <p className="text-xs mt-1 text-[var(--text-secondary)]">
                {t("Add this phone or computer to sign in with your fingerprint or face, without typing a password.")}
              </p>
            </div>
            {devices === null ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              devices.length > 0 && (
                <ul className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                  {devices.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{d.name}</p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {t("Added {date}", { date: fmt(d.created_at) })} · {d.last_used_at ? t("Last used {date}", { date: fmt(d.last_used_at) }) : t("Never used")}
                        </p>
                      </div>
                      <button type="button" aria-label={t("Remove this device?")} onClick={() => remove(d)} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ color: "var(--danger)" }}>
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
            <Field label={t("Device name")}>
              <input className="ks-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <button type="button" onClick={add} disabled={busy} className="ks-btn-primary w-full flex items-center justify-center gap-2">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {t("Add this device")}
            </button>
          </section>
        )}

        {supported && canLock && (
          <section className="space-y-3 pt-4 border-t border-[var(--border)]">
            <div>
              <h3 className="font-bold flex items-center gap-1.5"><Lock size={15} /> {t("Lock the app")}</h3>
              <p className="text-xs mt-1 text-[var(--text-secondary)]">
                {t("Ask for your fingerprint, face or screen lock when the app opens or after you have been away.")}
              </p>
            </div>
            {hasBio === false ? (
              <p className="text-xs text-[var(--text-secondary)]">{t("Set up a fingerprint, Face ID or screen lock on this phone first.")}</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{lock ? t("The app lock is on") : t("The app lock is off")}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(lock)}
                    aria-label={t("Lock the app")}
                    disabled={busy || hasBio === null}
                    onClick={toggleLock}
                    className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                    style={{ background: lock ? "var(--grad)" : "var(--bg-surface-alt)", border: "1px solid var(--border)" }}
                  >
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: lock ? "22px" : "2px" }} />
                  </button>
                </div>
                {lock && (
                  <Field label={t("Ask again")}>
                    <select
                      className="ks-input"
                      value={lock.minutes}
                      onChange={(e) => {
                        setLockMinutes(user.id, Number(e.target.value));
                        setLock(getLockConfig(user.id));
                      }}
                    >
                      {LOCK_DELAYS.map((m) => (
                        <option key={m} value={m}>{t(DELAY_LABELS[m])}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}
          </section>
        )}

        {error && <p className="text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}
