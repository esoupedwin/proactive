-- Second expert kind: 'analyst' — a neutral, evidence-based analyst that
-- interprets each report (what's happening, why it matters, what may happen
-- next) and tracks its own forward scenarios over time.
-- Run in the Supabase SQL editor.

alter type expert_kind add value if not exists 'analyst';
