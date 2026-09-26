-- Free/Pro plan flag per shop. Set manually for now (via the /upgrade
-- page's toggle) until a real payment gateway is wired up — this column
-- is the single source of truth ModuleGuard and other gates read from, so
-- swapping in real billing later only means writing to this same column
-- from a payment webhook instead of a button click.
alter table shops add column if not exists plan text not null default 'free' check (plan in ('free', 'pro'));
