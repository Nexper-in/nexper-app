"use client";

import { useCallback, useEffect, useState } from "react";
import { flushQueue, isNetworkFailure as isNetFail } from "@/lib/offlineQueueCore";

const QUEUE_KEY = "nexper.pendingWrites";
// Pre-rebrand key. Devices may still hold unsynced bills under it.
const LEGACY_QUEUE_KEY = "sabstore.pendingWrites";

function parseList(raw) {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function readQueue() {
  try {
    const legacy = localStorage.getItem(LEGACY_QUEUE_KEY);
    if (legacy) {
      const merged = [...parseList(legacy), ...parseList(localStorage.getItem(QUEUE_KEY))];
      localStorage.setItem(QUEUE_KEY, JSON.stringify(merged));
      localStorage.removeItem(LEGACY_QUEUE_KEY);
    }
    return parseList(localStorage.getItem(QUEUE_KEY));
  } catch {
    return [];
  }
}
function writeQueue(items) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

const FAILED_KEY = "nexper.failedWrites";
function readFailed() {
  try {
    return parseList(localStorage.getItem(FAILED_KEY));
  } catch {
    return [];
  }
}

function isNetworkFailure(err) {
  return isNetFail(err, typeof navigator === "undefined" ? true : navigator.onLine);
}

// Wraps a Supabase write (rpc or insert) so it queues locally when the
// device is offline or the request can't reach the network, and retries
// automatically when the connection comes back. Good enough for shop
// wifi dropping mid-bill; not a full sync engine — no conflict
// resolution, and a write that keeps failing for a real (non-network)
// reason after being queued will keep failing on every retry.
//
// Usage:
//   const { run, pendingCount } = useOfflineQueue(supabase);
//   await run({ type: "rpc", fn: "save_bill", args: { p_bill } });   // idempotent: a replay saves nothing twice
//   await run({ type: "insert", table: "expenses", rows: [row] });
export function useOfflineQueue(supabase) {
  const [pendingCount, setPendingCount] = useState(0);

  const send = useCallback(
    (op) => {
      if (op.type === "rpc") return supabase.rpc(op.fn, op.args);
      if (op.type === "insert") return supabase.from(op.table).insert(op.rows);
      throw new Error(`Unknown offline-queue op type: ${op.type}`);
    },
    [supabase]
  );

  const [failedCount, setFailedCount] = useState(0);
  const flush = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) return;
    const { remaining, failed } = await flushQueue(queue, send, { online: typeof navigator === "undefined" ? true : navigator.onLine });
    writeQueue(remaining);
    setPendingCount(remaining.length);
    if (failed.length) {
      // The server said no, repeatedly: it will never work. Keep a copy (so it can be looked at) and
      // tell the shopkeeper instead of retrying forever.
      const all = [...readFailed(), ...failed.map((f) => ({ ...f, at: new Date().toISOString() }))];
      localStorage.setItem(FAILED_KEY, JSON.stringify(all.slice(-50)));
      setFailedCount(all.length);
      window.dispatchEvent(new CustomEvent("nexper:queue-failed", { detail: failed.map((f) => f.reason) }));
    }
  }, [send]);

  useEffect(() => {
    setPendingCount(readQueue().length);
    setFailedCount(readFailed().length);
    window.addEventListener("online", flush);
    // Writes queued before the app was closed are sent as soon as it opens again, not only when the
    // connection returns while it is open.
    if (typeof navigator === "undefined" || navigator.onLine) flush();
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  const run = useCallback(
    async (op) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const queue = readQueue();
        queue.push(op);
        writeQueue(queue);
        setPendingCount(queue.length);
        return { queued: true };
      }
      try {
        const { data, error } = await send(op);
        if (error) throw error;
        return { queued: false, data };
      } catch (err) {
        if (isNetworkFailure(err)) {
          const queue = readQueue();
          queue.push(op);
          writeQueue(queue);
          setPendingCount(queue.length);
          return { queued: true };
        }
        throw err;
      }
    },
    [send]
  );

  return { run, pendingCount, failedCount, flush };
}
