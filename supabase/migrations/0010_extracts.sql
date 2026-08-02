-- 2-agent backend: persistent extract store (Info Tracker writes, Reporter reads),
-- per-extract assessments, per-agent memory, and report feedback.
-- Run in the Supabase SQL editor.

create extension if not exists vector;

-- ============================================================
-- Extracts: topic-scoped corpus, decoupled from reports.
-- Hybrid-searchable: semantic (pgvector) + keyword (tsvector).
-- ============================================================
create table public.extracts (
  id uuid primary key default gen_random_uuid (),
  topic_id uuid not null references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type source_type not null,
  title text not null,
  publisher text,
  url text not null,
  -- normalized url (no protocol/www/tracking params); dedupe key
  canonical_url text not null,
  -- as reported by the source; may be approximate ("2 days ago")
  published_at text,
  gist text not null,
  relevance text,
  novelty text, -- 'new' | 'update'
  contradiction text,
  -- corroboration: same story seen again from other urls
  corroborations int not null default 0,
  corroborating_urls text[] not null default '{}',
  duplicate_of uuid references public.extracts (id) on delete set null,
  -- text-embedding-3-small; nullable (seed rows have no embedding)
  embedding vector(1536),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(gist, ''))
  ) stored,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (topic_id, canonical_url)
);

create index extracts_topic_created_idx on public.extracts (topic_id, created_at desc);
create index extracts_fts_idx on public.extracts using gin (fts);
-- HNSW: builds incrementally from row one, no list-training needed (tiny scale).
create index extracts_embedding_idx on public.extracts using hnsw (embedding vector_cosine_ops);

alter table public.extracts enable row level security;

create policy "extracts: read own" on public.extracts
  for select using (auth.uid () = user_id);
create policy "extracts: insert own" on public.extracts
  for insert with check (auth.uid () = user_id);
create policy "extracts: update own" on public.extracts
  for update using (auth.uid () = user_id);
create policy "extracts: delete own" on public.extracts
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Assessments: the Reporter's judgement of what an extract means
-- for the topic (recorded per run, linked to the report if any).
-- ============================================================
create table public.assessments (
  id uuid primary key default gen_random_uuid (),
  extract_id uuid not null references public.extracts (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  report_id uuid references public.reports (id) on delete set null,
  assessment text not null,
  significance text not null check (significance in ('high', 'medium', 'low')),
  created_at timestamptz not null default now()
);

create index assessments_topic_idx on public.assessments (topic_id, created_at desc);
create index assessments_extract_idx on public.assessments (extract_id);

alter table public.assessments enable row level security;

create policy "assessments: read own" on public.assessments
  for select using (auth.uid () = user_id);
create policy "assessments: insert own" on public.assessments
  for insert with check (auth.uid () = user_id);
create policy "assessments: update own" on public.assessments
  for update using (auth.uid () = user_id);
create policy "assessments: delete own" on public.assessments
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Per-agent memory.
-- tracker:  { recent_subtopics: string[], last_run_at }
-- reporter: { recent_subtopics: string[], cursor, last_run_at }
--   cursor = max extracts.created_at the Reporter has processed.
-- ============================================================
create table public.agent_state (
  topic_id uuid not null references public.topics (id) on delete cascade,
  agent text not null check (agent in ('tracker', 'reporter')),
  user_id uuid not null references auth.users (id) on delete cascade,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (topic_id, agent)
);

alter table public.agent_state enable row level security;

create policy "agent_state: read own" on public.agent_state
  for select using (auth.uid () = user_id);
create policy "agent_state: insert own" on public.agent_state
  for insert with check (auth.uid () = user_id);
create policy "agent_state: update own" on public.agent_state
  for update using (auth.uid () = user_id);
create policy "agent_state: delete own" on public.agent_state
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Report feedback: thumbs + optional comment, fed back into the
-- Reporter's next run for this topic.
-- ============================================================
create table public.report_feedback (
  id uuid primary key default gen_random_uuid (),
  report_id uuid not null references public.reports (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  comment text,
  created_at timestamptz not null default now(),
  unique (report_id, user_id)
);

create index report_feedback_topic_idx on public.report_feedback (topic_id, created_at desc);

alter table public.report_feedback enable row level security;

create policy "report_feedback: read own" on public.report_feedback
  for select using (auth.uid () = user_id);
create policy "report_feedback: insert own" on public.report_feedback
  for insert with check (auth.uid () = user_id);
create policy "report_feedback: update own" on public.report_feedback
  for update using (auth.uid () = user_id);
create policy "report_feedback: delete own" on public.report_feedback
  for delete using (auth.uid () = user_id);

-- ============================================================
-- Hybrid search: keyword (FTS) + semantic (cosine) merged with
-- Reciprocal Rank Fusion. Security invoker so RLS applies for
-- user-scoped clients; service-role bypasses RLS as usual.
-- ============================================================
create or replace function public.search_extracts_hybrid (
  p_topic_id uuid,
  p_query text,
  p_embedding vector(1536),
  p_count int default 8,
  p_rrf_k int default 50,
  p_fts_weight float default 1.0,
  p_sem_weight float default 1.0
) returns setof public.extracts
language sql stable
set search_path = public
as $$
  with fts as (
    select id,
           row_number() over (
             order by ts_rank_cd(fts, websearch_to_tsquery('english', p_query)) desc
           ) as rank
    from extracts
    where topic_id = p_topic_id
      and fts @@ websearch_to_tsquery('english', p_query)
    limit p_count * 3
  ),
  sem as (
    select id,
           row_number() over (order by embedding <=> p_embedding) as rank
    from extracts
    where topic_id = p_topic_id
      and embedding is not null
    order by embedding <=> p_embedding
    limit p_count * 3
  )
  select e.*
  from extracts e
  join (
    select coalesce(f.id, s.id) as id,
           coalesce(p_fts_weight / (p_rrf_k + f.rank), 0)
         + coalesce(p_sem_weight / (p_rrf_k + s.rank), 0) as score
    from fts f
    full outer join sem s using (id)
  ) r on r.id = e.id
  order by r.score desc
  limit p_count;
$$;

grant execute on function public.search_extracts_hybrid to authenticated, service_role;
