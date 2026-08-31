-- "Tell me more" history: every highlighted passage and the explanation it
-- got, per user, browsable from Settings. Rows follow their topic's lifecycle
-- (cascade), like expert outputs.
-- Run in the Supabase SQL editor.

create table public.explanations (
  id uuid primary key default gen_random_uuid (),
  topic_id uuid not null references public.topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The highlighted passage, its surrounding block, and the model's answer.
  selection text not null,
  context text,
  explanation text not null,
  created_at timestamptz not null default now()
);

create index explanations_user_idx
  on public.explanations (user_id, created_at desc);

alter table public.explanations enable row level security;

create policy "explanations: read own" on public.explanations
  for select using (auth.uid () = user_id);
create policy "explanations: insert own" on public.explanations
  for insert with check (auth.uid () = user_id);
create policy "explanations: delete own" on public.explanations
  for delete using (auth.uid () = user_id);
