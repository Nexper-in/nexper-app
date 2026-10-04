-- 025: customer WhatsApp group link and the log of offer posts
--
-- shops.whatsapp_group_url: the invite link the owner pastes in (a link that
-- starts with https://chat.whatsapp.com/). It is printed on bills, shared in
-- the bill message, and shown as a QR poster. Nexper never posts into the
-- group itself: it prepares the message and the owner taps Send in WhatsApp.
--
-- offer_posts: a simple record of what the owner prepared (offer, new arrival
-- or special), so they can see and re-send past posts. Members can read;
-- only the owner can write, like clearance offers.
-- Run in the Supabase SQL editor after 001-024.

alter table shops add column if not exists whatsapp_group_url text;

create table if not exists offer_posts (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null default 'offer' check (kind in ('offer', 'arrival', 'special')),
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists offer_posts_shop_id_idx on offer_posts(shop_id, created_at desc);

alter table offer_posts enable row level security;

create policy "Members can view offer_posts" on offer_posts for select
  using (is_shop_member(shop_id));
create policy "Owners can insert offer_posts" on offer_posts for insert
  with check (is_shop_owner(shop_id));
create policy "Owners can delete offer_posts" on offer_posts for delete
  using (is_shop_owner(shop_id));
