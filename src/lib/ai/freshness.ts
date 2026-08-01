import { freshnessDays } from "../reports";
import type { Extract, UpdateFrequency } from "../types";

/**
 * Source freshness enforcement. The prompts ask the search for recent
 * sources; this is the hard guarantee on top: nothing VERIFIABLY older
 * than the topic's window survives to the report.
 */

/** Start of the UTC day `days` days ago. */
export function cutoffForDays(days: number, now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  );
}

/** Start of the UTC day `freshnessDays(frequency)` days ago. */
export function freshnessCutoff(
  frequency: UpdateFrequency,
  now: Date = new Date(),
): Date {
  return cutoffForDays(freshnessDays(frequency), now);
}

/**
 * Drops extracts whose parseable publication date is older than the cutoff.
 * Sources with unknown or unparseable dates are KEPT — Reddit threads and
 * some articles carry no clean date, and discarding them would gut the
 * community sections. The guarantee is "nothing verifiably too old".
 */
export function filterExtractsByAge(
  extracts: Extract[],
  cutoff: Date,
): Extract[] {
  return extracts.filter((extract) => {
    const publishedMs = Date.parse(extract.published_at);
    if (Number.isNaN(publishedMs)) return true;
    return publishedMs >= cutoff.getTime();
  });
}
