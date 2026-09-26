"use client";

import { useCallback, useEffect, useState } from "react";

const QUEUE_KEY = "nammalekka.pendingWrites";

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeQueue(items) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

// Distinguishes "couldn't reach the server" (worth queueing and retrying)
// from "the server rejected this" (a real error — surface it immediately,
// since silently re-queueing a bad-permission or bad-input request would
// just fail forever on every retry).
function isNetworkFailure(err) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed");
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
//   await run({ type: "rpc", fn: "sell_items", args: { p_shop_id, p_lines } });
//   await run({ type: "insert", table: "bills", rows: [billRow] });
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

  const flush = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) return;
    const remaining = [];
    for (const op of queue) {
      let { error } = await send(op);
      // A queued bill can collide with a bill_no another device already
      // synced while this one was offline (bills_shop_id_bill_no_key).
      // That's a real conflict, not a network blip — retrying it as-is
      // would fail forever every flush. Regenerate the number once and
      // retry immediately instead of leaving it stuck in the queue.
      if (error?.code === "23505" && op.type === "insert" && op.table === "bills") {
        const row = { ...op.rows[0], bill_no: `${op.rows[0].bill_no}-${Math.random().toString(36).slice(2, 5).toUpperCase()}` };
        ({ error } = await send({ ...op, rows: [row] }));
      }
      if (error) remaining.push(op); // still failing — keep it queued
    }
    writeQueue(remaining);
    setPendingCount(remaining.length);
  }, [send]);

  useEffect(() => {
    setPendingCount(readQueue().length);
    window.addEventListener("online", flush);
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

  return { run, pendingCount, flush };
}
