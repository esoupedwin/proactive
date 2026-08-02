/** Friendly names for known stages (tools, legacy pipeline, experts). */
const STAGE_LABEL: Record<string, string> = {
  // Searches
  web_search: "Web search",
  // Info Tracker tools
  "tool:exa_search": "Exa semantic web search",
  "tool:search_existing_extracts": "Check store for duplicates",
  "tool:record_extract": "Record extract",
  "tool:corroborate_extract": "Corroborate extract",
  // Reporter tools
  "tool:get_new_extracts": "Read new extracts since last report",
  "tool:search_extracts": "Search the extract store",
  "tool:record_assessment": "Record assessment",
  "tool:get_recent_assessments": "Recall recent assessments",
  // Experts
  mentor_tips: "Mentor — teaching tips",
  mentor_more: "Mentor — deeper explanation",
  analyst_analysis: "Analyst — interpret the report",
  // Legacy pipeline stages (older stored traces)
  search_plan: "Topic planner — build search queries",
  followup_queries: "Follow-up planner — target queries from news findings",
  seek_result: "Information seeker — web search",
  extraction_result: "Extractor — structure the found sources",
  report_draft: "Update reporter — write the briefing",
  memory_update: "Memory updater — fold report into topic memory",
};

export function stageLabel(stage: string): string {
  const known = STAGE_LABEL[stage];
  if (known) return known;
  const turn = stage.match(/^agent_turn:[^ ]+ \((.+)\)$/);
  if (turn) return `Model turn ${turn[1]}`;
  return stage;
}

