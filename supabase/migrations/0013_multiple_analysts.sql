-- Allow multiple analyst experts per topic (e.g. different specializations
-- commenting on the same briefing). Mentor stays one-per-topic — its teaching
-- memory is per-user-per-topic, so a second mentor would fight over it.
-- Run in the Supabase SQL editor.

alter table public.experts
  drop constraint experts_topic_id_kind_key;

create unique index experts_one_mentor_per_topic
  on public.experts (topic_id)
  where (kind = 'mentor');
