-- Interest Frame + watch modes.
-- The flat interest_areas list becomes a structured frame: each factor has a
-- name, an optional key question, and observable indicators. Topics gain a
-- watch mode: 'monitor' (the classic briefing) or 'question' (the Reporter
-- synthesizes extracts against the frame into an assessment of an analytical
-- question). Extracts gain a factor tag so the Tracker can file findings
-- under the frame. Run in the Supabase SQL editor.

-- Frame: jsonb array of { name, key_question, indicators[] }.
alter table public.topics
  add column interest_frame jsonb not null default '[]';

-- Backfill: each legacy interest area becomes a factor with just a name.
update public.topics
set interest_frame = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object(
        'name', area,
        'key_question', '',
        'indicators', '[]'::jsonb
      )
    )
    from unnest(interest_areas) as area
  ),
  '[]'::jsonb
);

alter table public.topics drop column interest_areas;

-- Watch mode: how Proactive watches this topic.
--   monitor  — classic briefing (latest developments, community, ...).
--   question — answer an analytical question against the interest frame.
alter table public.topics
  add column watch_mode text not null default 'monitor'
    check (watch_mode in ('monitor', 'question'));

-- The analytical question, required (by the app) when watch_mode = 'question'.
alter table public.topics add column analytical_question text;

-- Which frame factor an extract belongs to (matched by the Tracker at record
-- time; null when it doesn't clearly fit a factor).
alter table public.extracts add column factor text;
