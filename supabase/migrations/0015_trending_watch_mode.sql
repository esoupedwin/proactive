-- Third watch mode: 'trending' — reports track what is gaining traction
-- across news, Reddit, and Medium (what the public is paying attention to
-- and the mood around it), so the user can hold their own in conversation.
-- Run in the Supabase SQL editor.

alter table public.topics
  drop constraint topics_watch_mode_check;

alter table public.topics
  add constraint topics_watch_mode_check
    check (watch_mode in ('monitor', 'question', 'trending'));
