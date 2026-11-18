-- v1.2: Allow Time + Pages in Audiobook Only, alongside exact-chapter progress.
-- Here pages_read means print-edition page-equivalent progress for audiobook-only sessions.
-- For reading/read_listen, pages_read means physical pages progressed. Neither
-- option estimates pages from audiobook elapsed time or average chapter lengths.
-- Existing chapter validation trigger continues to require *every* exact mapped chapter.
alter table public.reading_sessions drop constraint if exists valid_reading_session_fields;
alter table public.reading_sessions
  add constraint valid_reading_session_fields check (
    activity_mode in ('reading','audiobook','read_listen')
    and (
      (log_type='pages'
        and pages_read > 0 and chapter_from is null and chapter_to is null
        and audio_start_minute is null and audio_end_minute is null)
      or (log_type='chapters' and chapter_from > 0 and chapter_to >= chapter_from
        and pages_read > 0 and audio_start_minute is null and audio_end_minute is null)
      or (log_type='audio_position' and activity_mode in ('audiobook','read_listen')
        and pages_read is null and chapter_from is null and chapter_to is null
        and audio_start_minute >= 0 and audio_end_minute > audio_start_minute)
    )
  );
comment on column public.reading_sessions.pages_read is
  'Pages progressed in selected print edition. For audiobook activity: page-equivalents, not physically read pages. NULL when only audio positions are known. Chapter pages use exact mapped boundaries only.';
