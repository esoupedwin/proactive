-- Per-report OpenAI usage + estimated cost.
-- Run in the Supabase SQL editor (safe to run more than once).

alter table public.reports
  add column if not exists usage jsonb;
