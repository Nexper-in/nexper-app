-- 049: Round Play area session amounts to whole rupees
--
-- 047 computed the charge to the paise (round(..., 2)) like a till would, but a tea
-- shop/canteen charging by the hour for carrom, chess etc. wants a plain rupee amount,
-- not ₹20.83. Postgres's round(numeric) already rounds half away from zero (0.5 and
-- above goes up, below 0.5 stays down), which is exactly that rule, so this just drops
-- the ", 2" and lets it round to the nearest rupee instead. Only the function changes;
-- the amount column stays numeric(10,2) so nothing downstream needs to change shape.

create or replace function stop_game_session(p_session uuid)
returns game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row game_sessions;
  v_minutes numeric;
begin
  select * into v_row from game_sessions where id = p_session for update;
  if v_row is null then raise exception 'Session not found'; end if;
  if not has_shop_permission(v_row.shop_id, 'play_area') then raise exception 'Not allowed'; end if;
  if v_row.stopped_at is not null then return v_row; end if; -- already stopped: calling twice is harmless

  v_minutes := greatest(1, ceil(extract(epoch from (now() - v_row.started_at)) / 60));
  update game_sessions
    set stopped_at = now(),
        amount = round(v_minutes * v_row.rate_at_start / 60)
    where id = p_session
    returning * into v_row;
  return v_row;
end;
$$;
revoke all on function stop_game_session(uuid) from public, anon;
grant execute on function stop_game_session(uuid) to authenticated, service_role;

select record_migration('049', '049_round_game_session_to_rupees.sql');
