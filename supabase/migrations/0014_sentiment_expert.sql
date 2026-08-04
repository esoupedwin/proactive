-- Third expert kind: 'sentiment' — reads each report and searches Reddit to
-- assess public sentiment on the reported points, adding a short commentary.
-- One per topic: it has no differentiating config, so a second would just
-- duplicate the first.
--
-- A new enum value must be committed before it can be referenced (55P04),
-- and the SQL editor runs a pasted batch in one implicit transaction — the
-- explicit COMMIT below ends it so the index creation sees the new value.
-- (A kind::text predicate would dodge 55P04 but fails with 42P17: enum casts
-- are not IMMUTABLE. If this still errors in your editor, run the statement
-- before the COMMIT alone, then the one after it.)

alter type expert_kind add value if not exists 'sentiment';

commit;

create unique index if not exists experts_one_sentiment_per_topic
  on public.experts (topic_id)
  where (kind = 'sentiment');
