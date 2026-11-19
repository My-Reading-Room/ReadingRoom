-- Run on existing v1.6 installations after earlier migrations.

-- v1.7: keep an immutable-by-past-date history of goal targets.
-- Changing the setting takes effect today; days before today keep old targets.
create table if not exists public.reading_goal_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_date date not null,
  target_minutes integer not null check(target_minutes between 1 and 1440),
  changed_at timestamptz not null default now(),
  primary key (user_id, effective_date)
);
create index if not exists reading_goal_history_user_effective_idx
  on public.reading_goal_history(user_id,effective_date desc);
alter table public.reading_goal_history enable row level security;
drop policy if exists "Read own or full-share goal history" on public.reading_goal_history;
create policy "Read own or full-share goal history" on public.reading_goal_history
  for select to authenticated using(public.can_view_full(user_id));
drop policy if exists "Insert own goal history" on public.reading_goal_history;
create policy "Insert own goal history" on public.reading_goal_history
  for insert to authenticated with check(user_id=(select auth.uid()) and effective_date = current_date);
drop policy if exists "Update own goal history for today" on public.reading_goal_history;
create policy "Update own goal history for today" on public.reading_goal_history
  for update to authenticated using(user_id=(select auth.uid()) and effective_date=current_date)
  with check(user_id=(select auth.uid()) and effective_date=current_date);
revoke all on public.reading_goal_history from anon,authenticated;
grant select,insert,update on public.reading_goal_history to authenticated;
-- Seed a start-of-year baseline from previously saved annual settings. Do not
-- overwrite existing history on repeated execution.
insert into public.reading_goal_history (user_id,effective_date,target_minutes)
select user_id,make_date(year,1,1),daily_minutes_target from public.reading_goals
where year between 1900 and 2200
on conflict(user_id,effective_date) do nothing;
