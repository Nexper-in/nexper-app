"use client";

import { useEffect, useState } from "react";
import { Page, Card, Field, SaveButton, Loading, MigrationNotice, useSettings } from "./shared";
import { FEATURES } from "@/lib/platformDefaults";

export default function FeaturesTab({ supabase }) {
  const { settings, save, needsMigration, error } = useSettings(supabase);
  const [plans, setPlans] = useState(null);
  const [flags, setFlags] = useState(null);

  useEffect(() => {
    if (settings) {
      setPlans(settings.plans);
      setFlags(settings.flags);
    }
  }, [settings]);

  if (error) return <p className="text-sm" style={{ color: "#F29C9C" }}>{error}</p>;
  if (!settings || !plans) return <Loading />;

  const toggleFeature = (plan, key) =>
    setPlans((p) => {
      const has = p[plan].features.includes(key);
      return { ...p, [plan]: { ...p[plan], features: has ? p[plan].features.filter((k) => k !== key) : [...p[plan].features, key] } };
    });
  const setLimit = (plan, key, v) => setPlans((p) => ({ ...p, [plan]: { ...p[plan], limits: { ...p[plan].limits, [key]: v === "" ? "" : Number(v) } } }));
  const isOff = (key) => flags[key] === false;
  const flipOff = (key) => setFlags((f) => (f[key] === false ? Object.fromEntries(Object.entries(f).filter(([k]) => k !== key)) : { ...f, [key]: false }));

  return (
    <Page title="Features" subtitle="Which plan includes what, plan limits, and a kill switch for each feature.">
      <MigrationNotice show={needsMigration} />

      <Card title="Plans" hint="What each plan includes once plans are enforced (Pricing & tax). Free always keeps the counter basics.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                <th className="py-2 pr-3 font-medium">Feature</th>
                <th className="py-2 px-3 font-medium text-center">{plans.free.label}</th>
                <th className="py-2 px-3 font-medium text-center">{plans.pro.label}</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.key} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3">
                    <div className="font-semibold">{f.label}</div>
                    <code className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{f.key}</code>
                  </td>
                  {["free", "pro"].map((plan) => (
                    <td key={plan} className="py-2 px-3 text-center">
                      <input type="checkbox" checked={plans[plan].features.includes(f.key)} onChange={() => toggleFeature(plan, f.key)} aria-label={`${f.label} in ${plan}`} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pr-3 font-semibold">Plan name</td>
                {["free", "pro"].map((plan) => (
                  <td key={plan} className="py-2 px-3">
                    <input className="ks-input text-center" value={plans[plan].label} onChange={(e) => setPlans((p) => ({ ...p, [plan]: { ...p[plan], label: e.target.value } }))} />
                  </td>
                ))}
              </tr>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pr-3"><Field label="Staff logins (besides the owner)" /></td>
                {["free", "pro"].map((plan) => (
                  <td key={plan} className="py-2 px-3">
                    <input className="ks-input text-center" type="number" min="0" value={plans[plan].limits.maxStaff} onChange={(e) => setLimit(plan, "maxStaff", e.target.value)} />
                  </td>
                ))}
              </tr>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pr-3"><Field label="AI scans per month" hint="Supplier bills and handwritten lists" /></td>
                {["free", "pro"].map((plan) => (
                  <td key={plan} className="py-2 px-3">
                    <input className="ks-input text-center" type="number" min="0" value={plans[plan].limits.aiScansPerMonth} onChange={(e) => setLimit(plan, "aiScansPerMonth", e.target.value)} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <SaveButton onSave={() => save("plans", plans)} disabled={needsMigration} label="Save plans" />
        </div>
      </Card>

      <Card title="Kill switches" hint="Turn a feature off for every shop at once (for example if a scan service is misbehaving). Overrides plans and per-shop settings.">
        <div className="grid sm:grid-cols-2 gap-x-6">
          {FEATURES.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
              <span className="text-sm font-semibold">{f.label}</span>
              <span className="flex items-center gap-2 text-xs" style={{ color: isOff(f.key) ? "#F29C9C" : "var(--text-secondary)" }}>
                {isOff(f.key) ? "Off for everyone" : "On"}
                <input type="checkbox" checked={!isOff(f.key)} onChange={() => flipOff(f.key)} aria-label={`${f.label} switch`} />
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3">
          <SaveButton onSave={() => save("flags", flags)} disabled={needsMigration} label="Save switches" />
        </div>
      </Card>
    </Page>
  );
}
