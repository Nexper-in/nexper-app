#!/usr/bin/env node
// Checks the app's translations.
//
//   node tools/check-i18n.mjs
//
// Finds every text marked for translation in the code, t("...") or T("..."),
// and fails if any language file (i18n/<code>.json) is missing it, has a
// leftover entry nothing uses, keeps an empty translation, or drops/changes
// a {placeholder} compared with the English text. English is the source:
// the English text itself is the key.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const langs = JSON.parse(fs.readFileSync(path.join(root, "i18n/languages.json"), "utf8")).filter((l) => l.code !== "en");

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "i18n"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(f.name)) out.push(p);
  }
  return out;
}

// t("text") / T("text"), double or single quoted, with escapes.
const CALL = /(?<![\w.$])[tT]\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g;
const used = new Map();
for (const file of ["app", "components", "lib"].flatMap((d) => walk(path.join(root, d)))) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(CALL)) {
    let text;
    try {
      text = m[1][0] === "'" ? JSON.parse(`"${m[1].slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) : JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (!used.has(text)) used.set(text, path.relative(root, file));
  }
}

if (process.argv.includes("--list")) {
  // Prints every text that needs a translation, as JSON (a starting point for a new language file).
  console.log(JSON.stringify(Object.fromEntries([...used.keys()].sort().map((k) => [k, ""])), null, 2));
  process.exit(0);
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const problems = [];
for (const lang of langs) {
  const file = path.join(root, "i18n", `${lang.code}.json`);
  if (!fs.existsSync(file)) {
    problems.push(`i18n/${lang.code}.json is missing`);
    continue;
  }
  const dict = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [text, where] of used) {
    if (!(text in dict)) problems.push(`${lang.code}: missing translation for "${text}" (used in ${where})`);
    else if (!String(dict[text]).trim()) problems.push(`${lang.code}: empty translation for "${text}"`);
    else if (placeholders(dict[text]) !== placeholders(text)) problems.push(`${lang.code}: "${text}" must keep the same {placeholders}`);
  }
  for (const text of Object.keys(dict)) {
    if (!used.has(text)) problems.push(`${lang.code}: "${text}" is not used in the code any more (remove it)`);
  }
}

if (problems.length) {
  console.log(`${problems.length} translation problem(s):\n  ` + problems.slice(0, 80).join("\n  ") + (problems.length > 80 ? `\n  …and ${problems.length - 80} more` : ""));
  process.exit(1);
}
console.log(`OK: ${used.size} texts translated into ${langs.length} languages.`);
