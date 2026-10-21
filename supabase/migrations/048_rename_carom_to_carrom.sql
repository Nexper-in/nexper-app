-- 048: Fix the misspelled Play area game type "carom" -> "carrom"
--
-- Migration 047 stored the board game as "carom" (a billiards shot) instead of
-- "carrom" (the actual game). Fixing it before any real shop has data to worry
-- about. No behavior change: the three start/stop/attach functions never branch
-- on the type string, they only store and display it.

update game_stations set type = 'carrom' where type = 'carom';

alter table game_stations drop constraint if exists game_stations_type_check;
alter table game_stations add constraint game_stations_type_check
  check (type in ('carrom', 'snooker', 'chess', 'video_game', 'other'));

select record_migration('048', '048_rename_carom_to_carrom.sql');
