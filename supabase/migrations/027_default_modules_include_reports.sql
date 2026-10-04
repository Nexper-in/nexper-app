-- 027: new shops get Reports switched on
--
-- The default for shops.enabled_modules (002) never included 'reports', so
-- Reports & GST bounced new owners back to Home until they found the toggle in
-- Store settings. New shops now start with it on. Existing shops that still
-- have exactly the old default (nobody changed their toggles) get it too; any
-- shop whose owner customised the list is left alone.
-- Run in the Supabase SQL editor after 001-026.

alter table shops alter column enabled_modules set default array[
  'dashboard','inventory','billing','history','credit','dayclose','expenses','cashbook','suppliers','reports'
];

update shops
  set enabled_modules = array_append(enabled_modules, 'reports')
  where enabled_modules @> array['dashboard','inventory','billing','history','credit','dayclose','expenses','cashbook','suppliers']
    and cardinality(enabled_modules) = 9
    and not ('reports' = any(enabled_modules));
