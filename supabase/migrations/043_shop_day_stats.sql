-- 043: one summary row per shop per day
--
-- Every bill, return, udhaar payment and expense adds into a small per-day row, so questions like
-- "what did this shop sell yesterday" or "what did the whole chain sell this week" read a few rows
-- instead of scanning every bill. The numbers are the same ones the Reports screen computes
-- (lib/periodReport.js): refresh_shop_day_stats() recomputes them from the books and is the
-- reference the triggers are tested against. A day is the Indian day (IST).
-- Also adds shops.summary_sent_on so the nightly summary can run in small batches.
-- See docs/MULTITENANT_DESIGN.md (task T15).

create table if not exists shop_day_stats (
  shop_id uuid not null references shops(id) on delete cascade,
  day date not null,
  bills integer not null default 0,
  sales numeric(14,2) not null default 0,          -- gross: bill totals, before returns
  cash numeric(14,2) not null default 0,           -- paid in cash (not udhaar)
  upi numeric(14,2) not null default 0,
  card numeric(14,2) not null default 0,
  bank numeric(14,2) not null default 0,
  udhaar_sales numeric(14,2) not null default 0,   -- bills put on credit
  discount numeric(14,2) not null default 0,
  gst numeric(14,2) not null default 0,            -- tax contained in the prices (qty*price*gst/(100+gst))
  cost numeric(14,2) not null default 0,           -- qty * purchase price where the bill line knows it
  returns integer not null default 0,
  returns_amount numeric(14,2) not null default 0,
  returns_cash numeric(14,2) not null default 0,
  returns_credit numeric(14,2) not null default 0,
  returns_digital numeric(14,2) not null default 0,
  udhaar_received numeric(14,2) not null default 0,
  expenses numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (shop_id, day)
);

alter table shop_day_stats enable row level security;
drop policy if exists "Members read day stats" on shop_day_stats;
create policy "Members read day stats" on shop_day_stats for select
  using (has_shop_permission(shop_id, 'dashboard') or has_shop_permission(shop_id, 'reports'));
-- No write policies and no write privileges: only the triggers and refresh_shop_day_stats() write.
revoke insert, update, delete, truncate on shop_day_stats from anon, authenticated, service_role;

alter table shops add column if not exists summary_sent_on date;

-- ---------- helpers ----------
create or replace function ist_day(p_ts timestamptz)
returns date language sql immutable as $$ select (p_ts at time zone 'Asia/Kolkata')::date $$;

-- Tax contained in a bill's prices, and what its items cost the shop (rounded to paise per bill
-- wherever they are added up, so the triggers and the recomputation always agree to the paisa).
create or replace function bill_items_gst(p_items jsonb)
returns numeric language sql immutable as $$
  select coalesce(sum(
    (l->>'qty')::numeric * (l->>'price')::numeric * coalesce(nullif(l->>'gst', '')::numeric, 0) / (100 + coalesce(nullif(l->>'gst', '')::numeric, 0))
  ), 0)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) l
  where l->>'qty' is not null and l->>'price' is not null;
$$;
create or replace function bill_items_cost(p_items jsonb)
returns numeric language sql immutable as $$
  select coalesce(sum((l->>'qty')::numeric * (l->>'cost_price')::numeric), 0)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) l
  where l->>'qty' is not null and nullif(l->>'cost_price', '') is not null;
$$;

-- ---------- the reference: recompute from the books ----------
-- p_shop null = every shop; p_from / p_to null = no limit. Returns what the rows should be.
create or replace function _shop_day_rows(p_shop uuid, p_from date, p_to date)
returns table (shop_id uuid, day date, bills integer, sales numeric, cash numeric, upi numeric, card numeric, bank numeric,
               udhaar_sales numeric, discount numeric, gst numeric, cost numeric, returns integer, returns_amount numeric,
               returns_cash numeric, returns_credit numeric, returns_digital numeric, udhaar_received numeric, expenses numeric)
language sql stable security definer set search_path = public as $$
  with src as (
    select b.shop_id, ist_day(b.date) as day,
           1 as bills, b.total as sales,
           case when b.payment_type <> 'credit' and coalesce(b.payment_method, 'cash') = 'cash' then b.total else 0 end as cash,
           case when b.payment_type <> 'credit' and b.payment_method = 'upi' then b.total else 0 end as upi,
           case when b.payment_type <> 'credit' and b.payment_method = 'card' then b.total else 0 end as card,
           case when b.payment_type <> 'credit' and b.payment_method = 'bank' then b.total else 0 end as bank,
           case when b.payment_type = 'credit' then b.total else 0 end as udhaar_sales,
           coalesce(b.discount_amount, 0) as discount, round(bill_items_gst(b.items), 2) as gst, round(bill_items_cost(b.items), 2) as cost,
           0 as returns, 0::numeric as returns_amount, 0::numeric as returns_cash, 0::numeric as returns_credit, 0::numeric as returns_digital,
           0::numeric as udhaar_received, 0::numeric as expenses
    from bills b
    where (p_shop is null or b.shop_id = p_shop)
      and (p_from is null or b.date >= (p_from::timestamp at time zone 'Asia/Kolkata'))
      and (p_to is null or b.date < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
    union all
    select r.shop_id, ist_day(r.date), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
           1, r.refund_amount,
           case when r.refund_method = 'cash' then r.refund_amount else 0 end,
           case when r.refund_method = 'credit' then r.refund_amount else 0 end,
           case when r.refund_method not in ('cash', 'credit') then r.refund_amount else 0 end,
           0, 0
    from sale_returns r
    where (p_shop is null or r.shop_id = p_shop)
      and (p_from is null or r.date >= (p_from::timestamp at time zone 'Asia/Kolkata'))
      and (p_to is null or r.date < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
    union all
    select c.shop_id, ist_day(c.date), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, c.amount, 0
    from credits c
    where c.type = 'payment' and (p_shop is null or c.shop_id = p_shop)
      and (p_from is null or c.date >= (p_from::timestamp at time zone 'Asia/Kolkata'))
      and (p_to is null or c.date < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
    union all
    select e.shop_id, ist_day(e.date), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, e.amount
    from expenses e
    where (p_shop is null or e.shop_id = p_shop)
      and (p_from is null or e.date >= (p_from::timestamp at time zone 'Asia/Kolkata'))
      and (p_to is null or e.date < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
  )
  select shop_id, day, sum(bills)::integer, sum(sales), sum(cash), sum(upi), sum(card), sum(bank), sum(udhaar_sales), sum(discount),
         sum(gst), sum(cost), sum(returns)::integer, sum(returns_amount), sum(returns_cash), sum(returns_credit), sum(returns_digital),
         sum(udhaar_received), sum(expenses)
  from src group by shop_id, day;
$$;
revoke all on function _shop_day_rows(uuid, date, date) from public, anon, authenticated;

-- Rebuilds the rows of one shop for a range of days (service role). The nightly job runs it for
-- yesterday and today before it reads, so a missed trigger can never leave a wrong number for long.
create or replace function refresh_shop_day_stats(p_shop uuid, p_from date, p_to date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  if p_shop is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Bad range'; end if;
  delete from shop_day_stats where shop_id = p_shop and day between p_from and p_to;
  insert into shop_day_stats (shop_id, day, bills, sales, cash, upi, card, bank, udhaar_sales, discount, gst, cost, returns, returns_amount,
                              returns_cash, returns_credit, returns_digital, udhaar_received, expenses)
    select * from _shop_day_rows(p_shop, p_from, p_to);
end $$;
revoke all on function refresh_shop_day_stats(uuid, date, date) from public, anon, authenticated;
grant execute on function refresh_shop_day_stats(uuid, date, date) to service_role;

-- ---------- incremental triggers ----------
create or replace function day_stats_after_bill()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pay numeric := new.total;
  v_method text := coalesce(new.payment_method, 'cash');
  v_credit boolean := new.payment_type = 'credit';
begin
  insert into shop_day_stats as s (shop_id, day, bills, sales, cash, upi, card, bank, udhaar_sales, discount, gst, cost)
  values (new.shop_id, ist_day(new.date), 1, new.total,
          case when not v_credit and v_method = 'cash' then v_pay else 0 end,
          case when not v_credit and v_method = 'upi' then v_pay else 0 end,
          case when not v_credit and v_method = 'card' then v_pay else 0 end,
          case when not v_credit and v_method = 'bank' then v_pay else 0 end,
          case when v_credit then v_pay else 0 end,
          coalesce(new.discount_amount, 0), round(bill_items_gst(new.items), 2), round(bill_items_cost(new.items), 2))
  on conflict (shop_id, day) do update set
    bills = s.bills + 1, sales = s.sales + excluded.sales, cash = s.cash + excluded.cash, upi = s.upi + excluded.upi,
    card = s.card + excluded.card, bank = s.bank + excluded.bank, udhaar_sales = s.udhaar_sales + excluded.udhaar_sales,
    discount = s.discount + excluded.discount, gst = s.gst + excluded.gst, cost = s.cost + excluded.cost, updated_at = now();
  return new;
end $$;

create or replace function day_stats_after_return()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into shop_day_stats as s (shop_id, day, returns, returns_amount, returns_cash, returns_credit, returns_digital)
  values (new.shop_id, ist_day(new.date), 1, new.refund_amount,
          case when new.refund_method = 'cash' then new.refund_amount else 0 end,
          case when new.refund_method = 'credit' then new.refund_amount else 0 end,
          case when new.refund_method not in ('cash', 'credit') then new.refund_amount else 0 end)
  on conflict (shop_id, day) do update set
    returns = s.returns + 1, returns_amount = s.returns_amount + excluded.returns_amount, returns_cash = s.returns_cash + excluded.returns_cash,
    returns_credit = s.returns_credit + excluded.returns_credit, returns_digital = s.returns_digital + excluded.returns_digital, updated_at = now();
  return new;
end $$;

create or replace function day_stats_after_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'payment' then
    insert into shop_day_stats as s (shop_id, day, udhaar_received) values (new.shop_id, ist_day(new.date), new.amount)
    on conflict (shop_id, day) do update set udhaar_received = s.udhaar_received + excluded.udhaar_received, updated_at = now();
  end if;
  return new;
end $$;

create or replace function day_stats_after_expense()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into shop_day_stats as s (shop_id, day, expenses) values (new.shop_id, ist_day(new.date), new.amount)
    on conflict (shop_id, day) do update set expenses = s.expenses + excluded.expenses, updated_at = now();
  else
    -- a deleted expense comes off, unless the whole shop is being removed (then its rows go too)
    if exists (select 1 from shops where id = old.shop_id) then
      update shop_day_stats set expenses = expenses - old.amount, updated_at = now() where shop_id = old.shop_id and day = ist_day(old.date);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists bills_day_stats on bills;
create trigger bills_day_stats after insert on bills for each row execute function day_stats_after_bill();
drop trigger if exists sale_returns_day_stats on sale_returns;
create trigger sale_returns_day_stats after insert on sale_returns for each row execute function day_stats_after_return();
drop trigger if exists credits_day_stats on credits;
create trigger credits_day_stats after insert on credits for each row execute function day_stats_after_credit();
drop trigger if exists expenses_day_stats on expenses;
create trigger expenses_day_stats after insert or delete on expenses for each row execute function day_stats_after_expense();

-- ---------- history ----------
-- One grouped insert over everything that exists. On a database with millions of bills run this
-- file by hand, shop by shop (refresh_shop_day_stats), instead.
delete from shop_day_stats;
insert into shop_day_stats (shop_id, day, bills, sales, cash, upi, card, bank, udhaar_sales, discount, gst, cost, returns, returns_amount,
                            returns_cash, returns_credit, returns_digital, udhaar_received, expenses)
  select * from _shop_day_rows(null, null, null);

select record_migration('043', '043_shop_day_stats.sql');
