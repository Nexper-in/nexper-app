import test from "node:test";
import assert from "node:assert/strict";
import { pickOrgInfo } from "../lib/orgInfo.js";

const orgs = [{ id: "A", name: "My Stores", max_shops: 3 }, { id: "B", name: "Their Chain", max_shops: 10 }];
const roles = { A: { role: "owner", shopIds: [] }, B: { role: "manager", shopIds: [] } };
const shops = [{ id: "a1", org_id: "A" }, { id: "b1", org_id: "B" }];

test("the company follows the open shop: an owner of A who manages B sees B's role in B", () => {
  assert.deepEqual(pickOrgInfo({ orgs, roles }, shops, [], "a1"), { org: orgs[0], role: "owner", shopIds: [] });
  const b = pickOrgInfo({ orgs, roles }, shops, [], "b1");
  assert.equal(b.org.id, "B");
  assert.equal(b.role, "manager", "the role in company B, not the owner role they hold in A");
});
test("a closed shop still shows its own company", () => {
  assert.equal(pickOrgInfo({ orgs, roles }, [], [{ id: "c1", org_id: "B" }], "c1").org.id, "B");
});
test("no open shop yet: the first company", () => {
  assert.equal(pickOrgInfo({ orgs, roles }, shops, [], null).org.id, "A");
});
test("loading and before update 035", () => {
  assert.equal(pickOrgInfo(undefined, shops, [], "a1"), undefined);
  assert.equal(pickOrgInfo(null, shops, [], "a1"), null);
});
test("a shop whose company is not known gives no company, not someone else's", () => {
  assert.equal(pickOrgInfo({ orgs, roles }, [{ id: "z", org_id: "Z" }], [], "z"), null);
});
test("a company the person has no role row in has role null", () => {
  assert.equal(pickOrgInfo({ orgs, roles: {} }, shops, [], "a1").role, null);
});
