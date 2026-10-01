"use client";

import { useEffect, useState } from "react";
import { Page, Card, Field, Toggle, SaveButton, Loading, MigrationNotice, useSettings } from "./shared";
import { priceWithTax } from "@/lib/platformConfig";

export default function PricingTab({ supabase }) {
  const { settings, save, needsMigration, error } = useSettings(supabase);
  const [pricing, setPricing] = useState(null);
  const [tax, setTax] = useState(null);
  const [gating, setGating] = useState(null);

  useEffect(() => {
    if (settings) {
      setPricing(settings.pricing);
      setTax(settings.tax);
      setGating(settings.gating);
    }
  }, [settings]);

  if (error) return <p className="text-sm" style={{ color: "#F29C9C" }}>{error}</p>;
  if (!settings || !pricing) return <Loading />;

  const set = (setter) => (k, v) => setter((o) => ({ ...o, [k]: v }));
  const num = (v) => (v === "" ? "" : Number(v));
  const monthly = priceWithTax(Number(pricing.monthlyInr) || 0, tax);
  const yearly = priceWithTax(Number(pricing.yearlyInr) || 0, tax);

  return (
    <Page title="Pricing & tax" subtitle="What Pro costs, the GST on it, and whether plans are enforced at all.">
      <MigrationNotice show={needsMigration} />

      <Card title="Plan enforcement" hint="Off means every shop gets every Pro feature for free (today's testing mode).">
        <Toggle on={gating.enforce} onChange={(v) => set(setGating)("enforce", v)} label="Enforce plans" hint="When on, Free shops only get what the Free plan includes (see Features) and Pro features need a Pro plan." />
        <Toggle on={gating.allowSelfPlanSwitch} onChange={(v) => set(setGating)("allowSelfPlanSwitch", v)} label="Let owners switch plan themselves" hint="Keep on only while there is no payment. Turn off once you take money: then only you can change a plan (Tenants tab)." />
        <div className="mt-3">
          <SaveButton onSave={() => save("gating", gating)} disabled={needsMigration} />
        </div>
      </Card>

      <Card title="Pro price" hint="Shown on the owner's Upgrade page.">
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <Field label="Monthly (₹)">
            <input className="ks-input" type="number" min="0" value={pricing.monthlyInr} onChange={(e) => set(setPricing)("monthlyInr", num(e.target.value))} />
          </Field>
          <Field label="Yearly (₹)">
            <input className="ks-input" type="number" min="0" value={pricing.yearlyInr} onChange={(e) => set(setPricing)("yearlyInr", num(e.target.value))} />
          </Field>
          <Field label="Free trial (days)" hint="0 for none. Recorded for you; billing is not built yet.">
            <input className="ks-input" type="number" min="0" value={pricing.trialDays} onChange={(e) => set(setPricing)("trialDays", num(e.target.value))} />
          </Field>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          Customer pays: monthly ₹{monthly.total} ({monthly.inclusive ? `includes ₹${monthly.gst} GST` : `₹${monthly.base} + ₹${monthly.gst} GST`}), yearly ₹{yearly.total} ({yearly.inclusive ? `includes ₹${yearly.gst} GST` : `₹${yearly.base} + ₹${yearly.gst} GST`}).
        </p>
        <SaveButton onSave={() => save("pricing", pricing)} disabled={needsMigration} />
      </Card>

      <Card title="Tax (GST on Nexper's own subscription)" hint="Used for the price line on the Upgrade page and, later, for invoices to shops.">
        <div className="grid sm:grid-cols-2 gap-3 mb-1">
          <Field label="GST rate (%)">
            <input className="ks-input" type="number" min="0" max="40" step="0.5" value={tax.gstRatePct} onChange={(e) => set(setTax)("gstRatePct", num(e.target.value))} />
          </Field>
          <Field label="SAC code" hint="998314 is the usual one for software as a service. Check with your CA.">
            <input className="ks-input" value={tax.sacCode} onChange={(e) => set(setTax)("sacCode", e.target.value)} />
          </Field>
          <Field label="Legal name">
            <input className="ks-input" value={tax.legalName} onChange={(e) => set(setTax)("legalName", e.target.value)} placeholder="Registered business name" />
          </Field>
          <Field label="Nexper's GSTIN">
            <input className="ks-input" value={tax.gstin} onChange={(e) => set(setTax)("gstin", e.target.value.toUpperCase())} placeholder="15 characters" />
          </Field>
        </div>
        <div className="mb-3">
          <Field label="Registered address">
            <textarea className="ks-input" rows={2} value={tax.address} onChange={(e) => set(setTax)("address", e.target.value)} />
          </Field>
        </div>
        <Toggle on={tax.pricesIncludeGst} onChange={(v) => set(setTax)("pricesIncludeGst", v)} label="Prices already include GST" hint="Off: GST is added on top of the price above." />
        <div className="mt-3">
          <SaveButton onSave={() => save("tax", tax)} disabled={needsMigration} />
        </div>
      </Card>
    </Page>
  );
}
