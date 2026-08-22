-- Per-topic read state, so the topic switcher can separate topics whose
-- report you haven't seen yet from ones you have. Set when the briefing page
-- renders; compared against last_generated_at to decide "new".
-- Null means never opened — a topic with a report is new until you read it.
-- Run in the Supabase SQL editor.

alter table public.topics
  add column if not exists last_read_at timestamptz;
