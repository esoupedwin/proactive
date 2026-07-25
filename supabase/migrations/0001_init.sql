-- Proactive — initial schema
-- Run in the Supabase SQL editor, or via `supabase db push`.

-- ============================================================
-- Enums
-- ============================================================
create type detail_level as enum ('brief', 'standard', 'deep');
create type topic_status as enum ('active', 'paused');
create type update_frequency as enum ('manual', 'daily', 'weekly');
create type report_status as enum ('generating', 'ready', 'error');
create type source_type as enum ('news', 'reddit', 'medium');

-- ============================================================
-- Profiles (user memory)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  -- user memory
  default_detail_level detail_level not null default 'standard',
  expertise_level text, -- optional free-text, e.g. "software engineer"
  last_viewed_topic_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (auth.uid () = id);
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid () = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid () = id);

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user ();

-- Backfill profiles for users who signed up before this migration ran.
insert into public.profiles (id, display_name, avatar_url)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', email),
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

-- ============================================================
-- Topics
-- ============================================================
create table public.topics (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  -- "I want to know" description
  description text not null default '',
  interest_areas text[] not null default '{}',
  detail_level detail_level not null default 'standard',
  frequency update_frequency not null default 'daily',
  status topic_status not null default 'active',
  position int not null default 0,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index topics_user_idx on public.topics (user_id, position);

alter table public.topics enable row level security;

create policy "topics: read own" on public.topics
  for select using (auth.uid () = user_id);
create policy "topics: insert own" on public.topics
  for insert with check (auth.uid () = user_id);
create policy "topics: update own" on public.topics
  for update using (auth.uid () = user_id);
create policy "topics: delete own" on public.topics
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Reports
-- ============================================================
create table public.reports (
  id uuid primary key default gen_random_uuid (),
  topic_id uuid not null references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status report_status not null default 'generating',
  -- Structured report body; see ReportSections in src/lib/types.ts
  sections jsonb,
  -- One-line summary shown in report history
  summary text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index reports_topic_idx on public.reports (topic_id, created_at desc);

alter table public.reports enable row level security;

create policy "reports: read own" on public.reports
  for select using (auth.uid () = user_id);
create policy "reports: insert own" on public.reports
  for insert with check (auth.uid () = user_id);
create policy "reports: update own" on public.reports
  for update using (auth.uid () = user_id);
create policy "reports: delete own" on public.reports
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Sources (structured extracts backing a report)
-- ============================================================
create table public.sources (
  id uuid primary key default gen_random_uuid (),
  report_id uuid not null references public.reports (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type source_type not null,
  title text not null,
  publisher text, -- publisher, subreddit, or Medium author/publication
  url text not null,
  published_at text, -- as reported by the source; may be approximate
  gist text not null,
  relevance text, -- why this matters for the topic
  novelty text,   -- 'new' | 'update' | 'repeat' (free text kept simple)
  contradiction text, -- potential conflict with prior knowledge, if any
  created_at timestamptz not null default now()
);

create index sources_report_idx on public.sources (report_id);

alter table public.sources enable row level security;

create policy "sources: read own" on public.sources
  for select using (auth.uid () = user_id);
create policy "sources: insert own" on public.sources
  for insert with check (auth.uid () = user_id);
create policy "sources: delete own" on public.sources
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Topic memory (topic + knowledge memory)
-- ============================================================
create table public.topic_memory (
  topic_id uuid primary key references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- developments already reported to the user: [{ id, text, first_reported_at }]
  reported_developments jsonb not null default '[]',
  -- emerging themes: [{ theme, trend }]
  themes jsonb not null default '[]',
  -- knowledge memory: [{ fact, entities, confidence, source_note }]
  facts jsonb not null default '[]',
  -- unresolved questions / contradictions: [{ question, context }]
  open_questions jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table public.topic_memory enable row level security;

create policy "topic_memory: read own" on public.topic_memory
  for select using (auth.uid () = user_id);
create policy "topic_memory: insert own" on public.topic_memory
  for insert with check (auth.uid () = user_id);
create policy "topic_memory: update own" on public.topic_memory
  for update using (auth.uid () = user_id);
create policy "topic_memory: delete own" on public.topic_memory
  for delete using (auth.uid () = user_id);
