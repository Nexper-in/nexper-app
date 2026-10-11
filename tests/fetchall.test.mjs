// Run: npm test. The database API returns at most 1000 rows and stops without an
// error; screens that need every row must read page by page (lib/fetchAll.js).
import test from "node:test";
import assert from "node:assert/strict";

const F = await import("../lib/fetchAll.js");

// A tiny database that pages like the real one (range) and records what is asked.
function fakeDb(rows) {
  return {
    from() {
      let out = [...rows];
      const b = {
        select: () => b,
        eq: (c, v) => ((out = out.filter((r) => r[c] === v)), b),
        order: () => b,
        range: (lo, hi) => ((out = out.slice(lo, hi + 1)), b),
        then: (res) => Promise.resolve({ data: out, error: null }).then(res),
      };
      return b;
    },
  };
}

test("paging: reads every page, nothing is cut at 1000", async () => {
  const many = Array.from({ length: 2500 }, (_, i) => ({ id: i, shop_id: "S1" }));
  const db = fakeDb(many);
  const { data, error } = await F.fetchAll(() => db.from("bills").select("*").eq("shop_id", "S1").order("id"));
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.equal(new Set(data.map((r) => r.id)).size, 2500, "no row twice");
});

test("paging: a maximum stops a runaway read", async () => {
  const db = fakeDb(Array.from({ length: 5000 }, (_, i) => ({ id: i })));
  const capped = await F.fetchAll(() => db.from("x").select("*"), { max: 1500 });
  assert.ok(capped.data.length >= 1500 && capped.data.length <= 2000);
});

test("paging: an error is returned with what was read so far", async () => {
  let calls = 0;
  const make = () => ({ range: async () => (++calls === 1 ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null } : { data: null, error: { message: "boom" } }) });
  const out = await F.fetchAll(make);
  assert.equal(out.error.message, "boom");
  assert.equal(out.data.length, 1000);
});

test("windows: today and N days ago start at midnight", () => {
  const today = new Date(F.startOfToday());
  assert.equal(today.getHours(), 0);
  assert.equal(today.getMinutes(), 0);
  const week = new Date(F.daysAgo(7));
  assert.equal(week.getHours(), 0);
  assert.ok(Math.round((today - week) / 86400000) === 7);
});
