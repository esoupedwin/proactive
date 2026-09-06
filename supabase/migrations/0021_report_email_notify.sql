-- Email notification preference: when true (the default), the user is
-- emailed whenever one of their topics finishes generating a report.
-- Toggled on Settings → Profile Preferences.
-- Run in the Supabase SQL editor.

alter table public.profiles
  add column if not exists notify_email boolean not null default true;
