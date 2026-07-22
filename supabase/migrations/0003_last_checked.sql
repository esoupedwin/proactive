-- When a re-fetch finds nothing new, we keep the cached update and
-- record when it was last checked instead.
-- Run this in the Supabase SQL editor.

alter table public.updates
  add column last_checked_at timestamptz;
