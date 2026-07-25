-- Adds live progress tracking to report generation.
-- Run in the Supabase SQL editor (safe to run more than once).

alter table public.reports
  add column if not exists stage text;
