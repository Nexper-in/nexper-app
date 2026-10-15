// The part of the offline queue that does not touch the browser, so it can be tested.
// A queued write is { type: "rpc", fn, args } or { type: "insert", table, rows }.

export const MAX_ATTEMPTS = 5;

// Is this a "could not reach the server" failure (worth keeping and retrying) rather than the
// server saying no (a real error)? `online` is navigator.onLine.
export function isNetworkFailure(err, online = true) {
  if (!online) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed");
}

// The function does not exist in this database yet (an update has not been run).
export function isMissingFunction(err) {
  return err?.code === "PGRST202" || err?.code === "42883" || /could not find the function|schema cache/i.test(String(err?.message || ""));
}

// Tries every queued write once. Returns { remaining, failed, sent }:
//   remaining  still to try later (network down, or the server said no fewer than MAX_ATTEMPTS times)
//   failed     the server said no MAX_ATTEMPTS times: it will never work, so it is taken out of the queue
//              and handed back to be shown to the shopkeeper
//   sent       how many went through
// save_bill is idempotent, so retrying it can never save a bill twice.
export async function flushQueue(queue, send, { online = true } = {}) {
  const remaining = [];
  const failed = [];
  let sent = 0;
  for (const op of queue) {
    let res;
    try {
      res = await send(op);
    } catch (err) {
      res = { error: err };
    }
    let { error } = res || {};
    // Old queued bills (before save_bill) could collide on a bill number another device used.
    if (error?.code === "23505" && op.type === "insert" && op.table === "bills") {
      const row = { ...op.rows[0], bill_no: `${op.rows[0].bill_no}-${Math.random().toString(36).slice(2, 5).toUpperCase()}` };
      try {
        ({ error } = await send({ ...op, rows: [row] }));
      } catch (err) {
        error = err;
      }
    }
    if (!error) {
      sent += 1;
      continue;
    }
    if (isNetworkFailure(error, online)) {
      remaining.push(op);
      continue;
    }
    const attempts = (op.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) failed.push({ op, reason: String(error.message || error) });
    else remaining.push({ ...op, attempts });
  }
  return { remaining, failed, sent };
}
