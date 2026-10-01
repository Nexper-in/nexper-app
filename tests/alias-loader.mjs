// Lets plain Node run the app's lib files: maps "@/x" to the repo root and
// adds .js to extensionless relative imports.
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let p = path.join(root, specifier.slice(2));
    if (!fs.existsSync(p) && fs.existsSync(p + ".js")) p += ".js";
    return next(pathToFileURL(p).href, context);
  }
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}
