import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, versionAtLeast, getDbVersion } from "../lib/dbVersion.js";

test("versions compare by number, then letter", () => {
  assert.equal(compareVersions("036", "035"), 1);
  assert.equal(compareVersions("035", "036"), -1);
  assert.equal(compareVersions("012b", "012"), 1);
  assert.equal(compareVersions("012b", "013"), -1);
  assert.equal(compareVersions("100", "99"), 1);
  assert.equal(compareVersions("036", "036"), 0);
});
test("a missing version is older than everything", () => {
  assert.equal(versionAtLeast(null, "036"), false);
  assert.equal(versionAtLeast(undefined, "001"), false);
  assert.equal(versionAtLeast("036", "036"), true);
  assert.equal(versionAtLeast("040", "037"), true);
  assert.equal(versionAtLeast("035", "036"), false);
});
test("getDbVersion is null before update 036 or on an error", async () => {
  assert.equal(await getDbVersion({ rpc: async () => ({ data: null, error: { message: "function does not exist" } }) }), null);
  assert.equal(await getDbVersion({ rpc: async () => ({ data: "037", error: null }) }), "037");
  assert.equal(await getDbVersion({ rpc: async () => ({ data: null, error: null }) }), null);
});
