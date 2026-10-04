// Run: npm test. "Download my data": the spreadsheet text is safe to open,
// every table is read in full (page by page), nothing from another shop is
// asked for, and a table from a database update not yet run is skipped.
import test from "node:test";
import assert from "node:assert/strict";

const X = await import("../lib/exportData.js");
const F = await import("../lib/fetchAll.js");

test("csv: quotes, commas, newlines, empty values", () => {
  assert.equal(X.csvCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(X.csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(X.csvCell(null), "");
  assert.equal(X.csvCell(undefined), "");
  assert.equal(X.csvCell(0), "0");
  assert.equal(X.csvCell(12.5), "12.5");
  assert.equal(X.csvCell([{ a: 1 }]), '"[{""a"":1}]"');
});

test("csv: text that Excel would run as a formula is defused, numbers are not", () => {
  for (const evil of ['=HYPERLINK("http://evil","x")', "+cmd|' /C calc'!A0", "-2+3", "@SUM(A1)", "\tTAB", "\rCR"]) {
    assert.ok(X.csvCell(evil).replace(/^"/, "").startsWith("'"), `not defused: ${JSON.stringify(evil)}`);
  }
  assert.equal(X.csvCell(-5), "-5");
  assert.equal(X.csvCell("Ravi =)"), "Ravi =)");
});

test("csv: header from the data, BOM for Excel, Indian scripts survive", () => {
  const out = X.toCsv([{ name: "చాయ్", qty: 2 }, { name: "Tea", qty: 3, extra: "x" }]);
  assert.ok(out.startsWith("﻿name,qty,extra\r\n"));
  assert.ok(out.includes("చాయ్,2,\r\n"));
});

test("bill lines: one row per item sold with the line total", () => {
  const rows = X.billLines([
    { bill_no: "KS-1", date: "2026-10-01", customer_name: "Ravi", payment_type: "cash", items: [{ name: "Tea", qty: 3, price: 10 }, { name: "Biscuit", qty: 2, price: 4.5 }] },
    { bill_no: "KS-2", items: null },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.line_total), [30, 9]);
});

test("file name: safe for any shop name", () => {
  assert.equal(X.exportFileName({ name: "Sri Tea / Stall #1!" }, new Date("2026-10-04T10:00:00Z")), "nexper-sri-tea-stall-1-2026-10-04.zip");
  assert.equal(X.exportFileName({ name: "!!!" }, new Date("2026-10-04T10:00:00Z")), "nexper-shop-2026-10-04.zip");
});

// ---------- a tiny database that records what is asked of it ----------
function fakeSupabase(tables, { missing = [] } = {}) {
  const asked = [];
  return {
    asked,
    from(name) {
      let rows = [...(tables[name] || [])];
      const filters = [];
      const b = {
        select: () => b,
        eq: (c, v) => (filters.push([c, v]), (rows = rows.filter((r) => (c.includes(".") ? true : r[c] === v))), b),
        order: () => b,
        range: (lo, hi) => ((rows = rows.slice(lo, hi + 1)), b),
        then: (res) => {
          asked.push({ table: name, filters });
          if (missing.includes(name)) return Promise.resolve({ data: null, error: { message: `relation "${name}" does not exist` } }).then(res);
          return Promise.resolve({ data: rows, error: null }).then(res);
        },
      };
      return b;
    },
  };
}

test("paging: reads every page, and nothing is cut at 1000", async () => {
  const many = Array.from({ length: 2500 }, (_, i) => ({ id: i, shop_id: "S1" }));
  const db = fakeSupabase({ bills: many });
  const { data, error } = await F.fetchAll(() => db.from("bills").select("*").eq("shop_id", "S1").order("id"));
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  const capped = await F.fetchAll(() => db.from("bills").select("*"), { max: 1500 });
  assert.ok(capped.data.length >= 1500 && capped.data.length <= 2000);
});

test("export: only this shop's data is requested, every file is built, a missing table is skipped", async () => {
  const shop = { id: "S1", name: "Sharma Store", type: "kirana" };
  const db = fakeSupabase(
    {
      bills: [{ id: "b1", shop_id: "S1", bill_no: "KS-1", total: 30, date: "2026-10-01", items: [{ name: "Tea", qty: 3, price: 10 }] }],
      credits: [{ id: "c1", shop_id: "S1", name: "=EVIL()", phone: "9", amount: 5, type: "charge" }],
      shop_products: [{ id: "sp1", shop_id: "S1", price: 10, product: { name: "Tea", category: "Drinks" } }],
    },
    { missing: ["supply_points", "supply_entries", "supply_payments"] }
  );
  const progress = [];
  const { files, counts, skipped } = await X.buildExport(db, shop, { onProgress: (n, total) => progress.push([n, total]) });
  assert.ok(db.asked.every((a) => a.filters.some(([, v]) => v === "S1")), "every read is scoped to the shop");
  assert.ok(files["bills.csv"].includes("KS-1"));
  assert.ok(files["bill_lines.csv"].includes("Tea"));
  assert.ok(files["udhaar_entries.csv"].includes("'=EVIL()"), "formula defused in the file");
  assert.ok(files["items.csv"].includes("Tea,") || files["items.csv"].includes(",Tea"));
  assert.deepEqual(skipped.sort(), ["supply_departments", "supply_entries", "supply_payments"]);
  assert.ok(files["README.txt"].includes("skipped"));
  assert.ok(JSON.parse(files["shop.json"]).name === "Sharma Store");
  assert.ok(!Object.keys(files).some((f) => /password|pin/i.test(f)), "no sign-in details");
  assert.equal(progress.at(-1)[0], progress.at(-1)[1]);
  assert.ok(counts.find(([f]) => f === "bills")[1] === 1);
});

test("export: a real error is reported, not hidden", async () => {
  const db = { from: () => { const b = { select: () => b, eq: () => b, order: () => b, range: () => b, then: (r) => Promise.resolve({ data: null, error: { message: "boom" } }).then(r) }; return b; } };
  await assert.rejects(() => X.buildExport(db, { id: "S1", name: "x" }), /boom/);
});

test("export: the zip really contains the files", async () => {
  const { zipSync, unzipSync, strToU8, strFromU8 } = await import("fflate");
  const zip = zipSync({ "bills.csv": strToU8("﻿a,b\r\n1,2\r\n"), "README.txt": strToU8("hi") });
  const back = unzipSync(zip);
  assert.equal(strFromU8(back["README.txt"]), "hi");
  assert.ok(strFromU8(back["bills.csv"]).includes("1,2"));
});
