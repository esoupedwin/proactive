-- User-adjustable body font weight (Display preferences).
-- Run in the Supabase SQL editor (safe to run more than once).

alter table public.profiles
  add column if not exists font_weight int not null default 400
  check (font_weight between 100 and 900);
