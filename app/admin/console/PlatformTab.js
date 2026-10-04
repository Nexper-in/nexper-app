"use client";

import { useEffect, useState } from "react";
import { Page, Card, Field, Toggle, SaveButton, Loading, MigrationNotice, useSettings } from "./shared";

export default function PlatformTab({ supabase }) {
  const { settings, save, needsMigration, error } = useSettings(supabase);
  const [announcement, setAnnouncement] = useState(null);
  const [maintenance, setMaintenance] = useState(null);

  useEffect(() => {
    if (settings) {
      setAnnouncement(settings.announcement);
      setMaintenance(settings.maintenance);
    }
  }, [settings]);

  if (error) return <p className="text-sm" style={{ color: "#F29C9C" }}>{error}</p>;
  if (!settings || !announcement) return <Loading />;

  return (
    <Page title="Platform" subtitle="Messages and the emergency stop for the whole app.">
      <MigrationNotice show={needsMigration} />

      <Card title="Announcement banner" hint="A line shown at the top of every shop's screen, for example a planned downtime or a new feature.">
        <Toggle on={announcement.enabled} onChange={(v) => setAnnouncement((a) => ({ ...a, enabled: v }))} label="Show the banner" />
        <div className="space-y-3 mt-2 mb-3">
          <Field label="Text (max 240 characters)">
            <textarea className="ks-input" rows={2} maxLength={240} value={announcement.text} onChange={(e) => setAnnouncement((a) => ({ ...a, text: e.target.value }))} />
          </Field>
          <Field label="Look">
            <select className="ks-input" value={announcement.tone} onChange={(e) => setAnnouncement((a) => ({ ...a, tone: e.target.value }))}>
              <option value="info">Information (purple)</option>
              <option value="warn">Warning (amber)</option>
            </select>
          </Field>
        </div>
        <SaveButton onSave={() => save("announcement", announcement)} disabled={needsMigration} />
      </Card>

      <Card title="Maintenance mode" hint="Replaces the app with a message for every shop. Admin pages keep working. Use briefly.">
        <Toggle on={maintenance.enabled} onChange={(v) => setMaintenance((m) => ({ ...m, enabled: v }))} label="Maintenance mode is on" />
        <div className="mt-2 mb-3">
          <Field label="Message shown to shops">
            <textarea className="ks-input" rows={2} maxLength={240} value={maintenance.message} onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))} />
          </Field>
        </div>
        <SaveButton onSave={() => save("maintenance", maintenance)} disabled={needsMigration} />
      </Card>
    </Page>
  );
}
