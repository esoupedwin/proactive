-- Stored news-search query per topic, formulated once by the LLM at topic
-- setup and reused for every "Related news" search.
-- Run in the Supabase SQL editor.

alter table public.topics
  add column if not exists news_query text;
