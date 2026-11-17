-- 052: game_session_orders was missing an update policy
--
-- Migration 051 gave game_session_orders select/insert/delete policies but
-- never an update one (game_session_players got one, this table didn't --
-- an oversight at the time, since nothing yet changed an order in place).
-- PR #35's quantity stepper (tapping "+" on an item already on a player's
-- tab) and usePlayArea.js's removePlayer (which reassigns a removed
-- player's orders back to "shared" instead of deleting them) both update a
-- row in game_session_orders -- and with no update policy, RLS quietly
-- matched zero rows. The qty update's .select().single() then errored with
-- "no rows returned", which the order picker swallowed without a toast --
-- so "+" looked like it did nothing.
--
-- Mirrors the existing delete policy: only an order not yet on a bill can
-- still be changed; once billed, it's history.

drop policy if exists "Play area members edit unbilled orders" on game_session_orders;
create policy "Play area members edit unbilled orders" on game_session_orders for update
  using (has_shop_permission(shop_id, 'play_area') and bill_id is null)
  with check (has_shop_permission(shop_id, 'play_area') and bill_id is null);

select record_migration('052', '052_game_session_orders_update_policy.sql');
