-- Long-term memory: key points the assistant remembers per interest.
-- Run this in the Supabase SQL editor.

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  source text not null check (source in ('news', 'medium', 'reddit')),
  content text not null,
  created_at timestamptz not null default now()
);

create index memories_user_interest_idx on public.memories (user_id, interest_id);

alter table public.memories enable row level security;

create policy "Users manage own memories"
  on public.memories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
