// Run: npm run check:audit. Fails on any high or critical advisory in the
// packages that ship, EXCEPT ones listed in tools/audit-allow.json. An entry
// there must say why it is safe and when to look at it again; after that date
// the check fails again, so an exception cannot be forgotten.
import { execSync } from "node:child_process";
import fs from "node:fs";

const allow = JSON.parse(fs.readFileSync(new URL("./audit-allow.json", import.meta.url), "utf8"));
let report;
try {
  report = JSON.parse(execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 50e6 }));
} catch (e) {
  report = JSON.parse(e.stdout); // npm audit exits non-zero when it finds something
}

const advisories = new Map();
for (const v of Object.values(report.vulnerabilities || {})) {
  for (const via of v.via) {
    if (typeof via === "object" && ["high", "critical"].includes(via.severity)) {
      advisories.set(via.url.split("/").pop(), { pkg: via.name, title: via.title, severity: via.severity });
    }
  }
}

const today = new Date().toISOString().slice(0, 10);
let bad = 0;
for (const [id, a] of advisories) {
  const ok = allow[id];
  if (!ok) {
    console.log(`FAIL ${id} (${a.severity}) ${a.pkg}: ${a.title}`);
    bad++;
  } else if (ok.reviewBy < today) {
    console.log(`FAIL ${id}: the exception expired on ${ok.reviewBy}. Look again: ${ok.reason}`);
    bad++;
  } else {
    console.log(`allowed until ${ok.reviewBy}: ${id} ${a.pkg}: ${ok.reason}`);
  }
}
for (const id of Object.keys(allow)) if (!advisories.has(id)) console.log(`note: ${id} no longer appears; remove it from tools/audit-allow.json`);
console.log(bad ? `${bad} problem(s)` : "OK: no unaccepted high or critical advisories in the shipped packages.");
process.exit(bad ? 1 : 0);
