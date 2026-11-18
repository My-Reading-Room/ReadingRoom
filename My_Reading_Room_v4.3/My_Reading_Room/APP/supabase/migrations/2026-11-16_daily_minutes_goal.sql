-- v1.6: daily reading-time goal across all activity modes.
-- Run on existing v1.2-v1.5 cloud projects. New projects use schema.sql instead.
-- RLS policies on reading_goals already restrict writes to the row owner
-- and reads to owner / Full-sharing viewers. Summary Only access remains aggregate-only.
alter table public.reading_goals
  add column if not exists daily_minutes_target integer not null default 30;
alter table public.reading_goals
  drop constraint if exists reading_goals_daily_minutes_target_check;
alter table public.reading_goals
  add constraint reading_goals_daily_minutes_target_check
  check (daily_minutes_target between 1 and 1440);
