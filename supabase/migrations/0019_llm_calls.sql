-- Append-only ledger of every OpenAI call: who triggered it, when, for which
-- activity, on which model, and what it consumed. reports.usage stays as the
-- per-report display cache; this is the source of record underneath it, and
-- what the daily estimate can be reconciled against OpenAI's Costs API.
-- Run in the Supabase SQL editor.

create table public.llm_calls (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Kept as bare uuids, not FKs: deleting a topic or report must not erase
  -- the record that its generation was paid for.
  topic_id uuid,
  report_id uuid,
  -- What the call was for: 'reporter_turn', 'tracker_turn', 'embedding',
  -- a structured schema name ('sentiment_reading', 'explanation', ...).
  activity text not null,
  model text not null,
  input_tokens int not null default 0,
  cached_input_tokens int not null default 0,
  output_tokens int not null default 0,
  web_search_calls int not null default 0,
  -- Priced at write time from the table then in force; tokens allow repricing.
  estimated_cost_usd numeric,
  created_at timestamptz not null default now()
);

create index llm_calls_user_created on public.llm_calls (user_id, created_at desc);
create index llm_calls_topic on public.llm_calls (topic_id) where topic_id is not null;

alter table public.llm_calls enable row level security;

create policy "llm_calls: read own" on public.llm_calls
  for select using (auth.uid () = user_id);
create policy "llm_calls: insert own" on public.llm_calls
  for insert with check (auth.uid () = user_id);
-- No update/delete policies: the ledger is append-only by design.
