-- New update frequency: every 3 days.
-- Run in the Supabase SQL editor.

alter type update_frequency add value if not exists 'every_3_days';
