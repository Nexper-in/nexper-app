-- 032: sign in with fingerprint, Face ID or a passkey
--
-- A passkey is a key pair kept by the phone or laptop: the private half never
-- leaves the device and is unlocked by fingerprint, Face ID or the screen lock;
-- we store only the public half. These two tables are read and written only by
-- the server (service role) after it has checked the device's proof, so they
-- have no row-level policies at all and are closed to the browser.
--
-- Run in the Supabase SQL editor after 001-031. Safe to run more than once.

create table if not exists passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,            -- how the device names this key
  public_key text not null,                      -- base64url of the COSE public key
  counter bigint not null default 0,             -- replay protection when the device reports one
  transports text[],
  device_type text,                              -- singleDevice or multiDevice (synced)
  backed_up boolean,
  name text not null default 'This device' check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_user_idx on passkeys (user_id);

-- One-time challenges: the server hands one out, the device signs it, and it can
-- be used once within five minutes.
create table if not exists passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null,
  kind text not null check (kind in ('register', 'login')),
  user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now()
);
create index if not exists passkey_challenges_expiry_idx on passkey_challenges (expires_at);

alter table passkeys enable row level security;
alter table passkey_challenges enable row level security;
-- No policies on purpose, and no access for the browser roles either.
revoke all on passkeys, passkey_challenges from anon, authenticated;
