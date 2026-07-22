export const SOURCES = ["news", "medium", "reddit"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  news: "News",
  medium: "Medium",
  reddit: "REDDIT",
};

export interface SourceLink {
  title: string;
  url: string;
}

export interface Interest {
  id: string;
  user_id: string;
  name: string;
  intent: string | null;
  created_at: string;
}

export interface Update {
  id: string;
  user_id: string;
  interest_id: string;
  source: Source;
  content: string;
  sources: SourceLink[];
  fetched_at: string;
  last_checked_at: string | null;
}

export interface Memory {
  id: string;
  user_id: string;
  interest_id: string;
  source: Source;
  content: string;
  created_at: string;
}

export function isSource(value: string): value is Source {
  return (SOURCES as readonly string[]).includes(value);
}
