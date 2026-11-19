-- My Reading Room v2.3.4: an explicit daily goal baseline per reader.
-- Back up the database first; run after the v2.3.2 migration.
-- Only additive profile metadata; no reading records are deleted.
BEGIN;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tracking_start_goal_minutes integer;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tracking_start_goal_minutes_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tracking_start_goal_minutes_check
  CHECK (tracking_start_goal_minutes BETWEEN 1 AND 1440);

-- For recently chosen tracking boundaries, the currently configured target
-- becomes the initial target (addresses moving 11/16 back to 11/15).
-- For older boundaries, prefer the actual goal at that historic start date.
UPDATE public.profiles p
SET tracking_start_goal_minutes = COALESCE(
  CASE WHEN p.tracking_start_date >= current_date - 14 THEN (
    SELECT h.target_minutes FROM public.reading_goal_history h
    WHERE h.user_id=p.id AND h.effective_date BETWEEN p.tracking_start_date AND current_date
    ORDER BY h.effective_date DESC LIMIT 1
  ) END,
  (SELECT h.target_minutes FROM public.reading_goal_history h
   WHERE h.user_id=p.id AND h.effective_date<=p.tracking_start_date
   ORDER BY h.effective_date DESC LIMIT 1),
  (SELECT h.target_minutes FROM public.reading_goal_history h
   WHERE h.user_id=p.id AND h.effective_date>=p.tracking_start_date
   ORDER BY h.effective_date ASC LIMIT 1),
  (SELECT g.daily_minutes_target FROM public.reading_goals g
   WHERE g.user_id=p.id ORDER BY g.year DESC LIMIT 1),
  30
)
WHERE p.tracking_start_goal_minutes IS NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
