import type { Source } from "@/lib/types";
import type { Fetcher } from "./shared";
import { fetchNews } from "./news";
import { fetchMedium } from "./medium";
import { fetchReddit } from "./reddit";

export const fetchers: Record<Source, Fetcher> = {
  news: fetchNews,
  medium: fetchMedium,
  reddit: fetchReddit,
};

export type { FetchResult } from "./shared";
