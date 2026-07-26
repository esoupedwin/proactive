-- Per-report LLM call trace (prompts, models, timing) for transparency.
-- Run in the Supabase SQL editor (safe to run more than once).

alter table public.reports
  add column if not exists trace jsonb;
