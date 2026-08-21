-- Fourth expert kind: 'personality' — studies and tracks the people behind a
-- topic. Stance mode scans the web for the key players on an issue, stores a
-- baseline, then updates each stance as reports and extracts arrive; profiles
-- mode explains the people mentioned in each report.
-- Multiple per topic (different modes/issues), so no unique index.
-- Run in the Supabase SQL editor.

alter type expert_kind add value if not exists 'personality';
