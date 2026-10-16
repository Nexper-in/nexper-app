import test from "node:test";
import assert from "node:assert/strict";
import { flushQueue, isNetworkFailure, isMissingFunction, MAX_ATTEMPTS } from "../lib/offlineQueueCore.js";

const bill = (id) => ({ type: "rpc", fn: "save_bill", args: { p_bill: { id } } });

test("a replayed save_bill that the server already has is just a success: nothing is stuck or doubled", async () => {
  const seen = new Map();
  const send = async (op) => {
    const id = op.args.p_bill.id;
    const created = !seen.has(id);
    seen.set(id, (seen.get(id) || 0) + 1);
    return { data: { id, created }, error: null };
  };
  const r = await flushQueue([bill("a"), bill("a"), bill("b")], send);
  assert.equal(r.sent, 3);
  assert.deepEqual(r.remaining, []);
  assert.deepEqual(r.failed, []);
});

test("a network failure keeps the write and does not count against it", async () => {
  const send = async () => ({ error: { message: "TypeError: Failed to fetch" } });
  let q = [bill("a")];
  for (let i = 0; i < 20; i++) q = (await flushQueue(q, send)).remaining;
  assert.equal(q.length, 1);
  assert.equal(q[0].attempts, undefined, "being offline never uses up the attempts");
});

test("a write the server keeps refusing is taken out after MAX_ATTEMPTS and handed back, not retried forever", async () => {
  const send = async () => ({ error: { message: "Only 0 of Tea left in stock — bill not saved" } });
  let q = [bill("a"), bill("b")];
  let failed = [];
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const r = await flushQueue(q, send);
    q = r.remaining;
    failed = failed.concat(r.failed);
  }
  assert.equal(q.length, 0, "the queue is empty again");
  assert.equal(failed.length, 2);
  assert.match(failed[0].reason, /left in stock/);
  assert.equal(failed[0].op.fn, "save_bill");
});

test("one bad write does not hold up the good ones behind it", async () => {
  const send = async (op) => (op.args.p_bill.id === "bad" ? { error: { message: "not permitted to bill for this shop" } } : { error: null });
  const r = await flushQueue([bill("bad"), bill("ok1"), bill("ok2")], send);
  assert.equal(r.sent, 2);
  assert.equal(r.remaining.length, 1);
  assert.equal(r.remaining[0].attempts, 1);
});

test("an old queued bill that collided on its number is retried once with a new number", async () => {
  const calls = [];
  const send = async (op) => {
    calls.push(op.rows[0].bill_no);
    return calls.length === 1 ? { error: { code: "23505", message: "bills_shop_id_bill_no_key" } } : { error: null };
  };
  const r = await flushQueue([{ type: "insert", table: "bills", rows: [{ bill_no: "KS-1001" }] }], send);
  assert.equal(r.sent, 1);
  assert.notEqual(calls[1], "KS-1001");
  assert.match(calls[1], /^KS-1001-[A-Z0-9]{3}$/);
});

test("an exception while sending counts as an error, it does not crash the flush", async () => {
  const send = async () => {
    throw new Error("boom");
  };
  const r = await flushQueue([bill("a")], send);
  assert.equal(r.remaining.length, 1);
  assert.equal(r.remaining[0].attempts, 1);
});

test("network and missing-function detection", () => {
  assert.equal(isNetworkFailure({ message: "Failed to fetch" }), true);
  assert.equal(isNetworkFailure({ message: "permission denied" }), false);
  assert.equal(isNetworkFailure({ message: "anything" }, false), true, "offline means every failure is a network failure");
  assert.equal(isMissingFunction({ code: "PGRST202", message: "x" }), true);
  assert.equal(isMissingFunction({ message: "Could not find the function public.save_bill" }), true);
  assert.equal(isMissingFunction({ message: "Only 1 of Tea left" }), false);
});
