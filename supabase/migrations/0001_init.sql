-- PROACTIVE initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  intent text,
  created_at timestamptz not null default now()
);

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  source text not null check (source in ('news', 'medium', 'reddit')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (interest_id, source)
);

create index interests_user_id_idx on public.interests (user_id);
create index updates_user_id_source_idx on public.updates (user_id, source);

alter table public.interests enable row level security;
alter table public.updates enable row level security;

create policy "Users manage own interests"
  on public.interests
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own updates"
  on public.updates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
