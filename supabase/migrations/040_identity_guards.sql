-- 040: identity guards
--
-- Shop helpers sign in with a staff code and PIN (a synthetic address ending in
-- @workers.nexper.internal) and belong to one shop. They must never be made managers or
-- analysts of a company, which would give a PIN account company-wide reach.
-- See docs/MULTITENANT_DESIGN.md section 4 (task T12).

create or replace function org_set_member(p_org uuid, p_email text, p_role text, p_shop_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_ids uuid[] := coalesce(p_shop_ids, '{}');
begin
  if auth.uid() is null or not is_org_owner(p_org) then
    raise exception 'Only the company owner can do that';
  end if;
  if p_role not in ('manager', 'analyst', 'area_manager') then
    raise exception 'Unknown role';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No Nexper account has that email. Ask them to sign up first.';
  end if;
  if exists (select 1 from organisations where id = p_org and owner_id = v_user) then
    raise exception 'That is the owner';
  end if;
  -- A shop helper's sign-in (staff code + PIN) is not a person who can run a company: refuse it.
  if exists (select 1 from auth.users where id = v_user and lower(email) like '%@workers.nexper.internal')
     or exists (select 1 from shop_members where user_id = v_user and staff_code is not null) then
    raise exception 'That sign-in belongs to a shop helper. Use the person''s own Nexper account.';
  end if;
  if (select count(*) from org_members where org_id = p_org) >= 50 and not exists (select 1 from org_members where org_id = p_org and user_id = v_user) then
    raise exception 'A company can have at most 50 people on its team';
  end if;
  if p_role = 'area_manager' then
    if coalesce(array_length(v_ids, 1), 0) = 0 then
      raise exception 'Choose at least one shop for an area manager';
    end if;
    if (select count(*) from shops where org_id = p_org and id = any (v_ids)) <> (select count(distinct x) from unnest(v_ids) x) then
      raise exception 'One of those shops is not in this company';
    end if;
  else
    v_ids := '{}';
  end if;
  insert into org_members (org_id, user_id, role, shop_ids) values (p_org, v_user, p_role, v_ids)
  on conflict (org_id, user_id) do update set role = excluded.role, shop_ids = excluded.shop_ids;
end $$;


revoke all on function org_set_member(uuid, text, text, uuid[]) from public, anon;
grant execute on function org_set_member(uuid, text, text, uuid[]) to authenticated, service_role;

select record_migration('040', '040_identity_guards.sql');
