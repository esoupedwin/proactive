-- Operator-editable app settings, keyed rows of jsonb. First use: the model
-- tier configuration the admin edits at /admin/models, which overrides the
-- TIER_* variables in .env.
-- Accessed only through the service-role client after an app-level admin
-- check, so RLS is enabled with NO policies: anon and authenticated roles
-- can neither read nor write.
-- Run in the Supabase SQL editor.

create table public.app_settings (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
