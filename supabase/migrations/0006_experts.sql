-- Experts: per-topic LLM modules that read generated reports and add output.
-- First expert kind: 'mentor' (educational "did you know" tips).
-- Run in the Supabase SQL editor.

create type expert_kind as enum ('mentor');

-- ============================================================
-- Experts attached to a topic
-- ============================================================
create table public.experts (
  id uuid primary key default gen_random_uuid (),
  topic_id uuid not null references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind expert_kind not null,
  name text not null,
  status topic_status not null default 'active',
  -- kind-specific settings; mentor: { "level": "basic" | "intermediate" | "advanced" }
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- one expert of each kind per topic (MVP)
  unique (topic_id, kind)
);

create index experts_topic_idx on public.experts (topic_id);

alter table public.experts enable row level security;

create policy "experts: read own" on public.experts
  for select using (auth.uid () = user_id);
create policy "experts: insert own" on public.experts
  for insert with check (auth.uid () = user_id);
create policy "experts: update own" on public.experts
  for update using (auth.uid () = user_id);
create policy "experts: delete own" on public.experts
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Expert outputs (one per expert per report)
-- ============================================================
create table public.expert_outputs (
  id uuid primary key default gen_random_uuid (),
  expert_id uuid not null references public.experts (id) on delete cascade,
  report_id uuid not null references public.reports (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind expert_kind not null,
  -- mentor: { "tips": [{ "id", "concept", "tip", "more" }] }
  output jsonb not null,
  created_at timestamptz not null default now(),
  unique (expert_id, report_id)
);

create index expert_outputs_report_idx on public.expert_outputs (report_id);

alter table public.expert_outputs enable row level security;

create policy "expert_outputs: read own" on public.expert_outputs
  for select using (auth.uid () = user_id);
create policy "expert_outputs: insert own" on public.expert_outputs
  for insert with check (auth.uid () = user_id);
create policy "expert_outputs: update own" on public.expert_outputs
  for update using (auth.uid () = user_id);
create policy "expert_outputs: delete own" on public.expert_outputs
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Expert memory (what the expert has taught / been told)
-- ============================================================
create table public.expert_memory (
  expert_id uuid primary key references public.experts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- mentor: { "taught": [{ "concept", "status": "taught"|"known"|"revisit", "times", "last_taught_at" }] }
  memory jsonb not null default '{"taught": []}',
  updated_at timestamptz not null default now()
);

alter table public.expert_memory enable row level security;

create policy "expert_memory: read own" on public.expert_memory
  for select using (auth.uid () = user_id);
create policy "expert_memory: insert own" on public.expert_memory
  for insert with check (auth.uid () = user_id);
create policy "expert_memory: update own" on public.expert_memory
  for update using (auth.uid () = user_id);
create policy "expert_memory: delete own" on public.expert_memory
  for delete using (auth.uid () = user_id);
