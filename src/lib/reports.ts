import type {
  Report,
  ReportUsage,
  Topic,
  TopicStatus,
  UpdateFrequency,
} from "./types";

/** A 'generating' report younger than this blocks a new generation. */
export const GENERATION_LOCK_MINUTES = 10;

/** The scheduled job's daily fire hour (see vercel.json: "0 8 * * *"). */
export const CRON_HOUR_UTC = 8;

const HOUR_MS = 60 * 60 * 1000;

/** Slightly under the nominal period so a daily 8:00 cron doesn't skip a topic generated at 8:01 the previous day. */
function dueThresholdMs(frequency: UpdateFrequency): number {
  switch (frequency) {
    case "daily":
      return 23 * HOUR_MS;
    case "every_3_days":
      return 71 * HOUR_MS; // 3 days minus the same 1h buffer
    default:
      return 6.5 * 24 * HOUR_MS; // weekly
  }
}

/**
 * The source-freshness window, derived from update frequency: a topic only
 * gathers sources published within its own cadence (anything older was
 * covered by the previous report). Manual topics keep the default window.
 */
export function freshnessDays(frequency: UpdateFrequency): number {
  switch (frequency) {
    case "daily":
      return 1;
    case "every_3_days":
      return 3;
    default:
      return 7; // weekly and manual
  }
}

/** Human label for a frequency value. */
export function frequencyLabel(frequency: UpdateFrequency): string {
  switch (frequency) {
    case "daily":
      return "Daily";
    case "every_3_days":
      return "Every 3 days";
    case "weekly":
      return "Weekly";
    default:
      return "Manual";
  }
}

/** Whether a scheduled run should regenerate this topic now. */
export function isTopicDue(topic: Topic, now: Date = new Date()): boolean {
  if (topic.status !== "active") return false;
  if (topic.frequency === "manual") return false;
  if (!topic.last_generated_at) return true;

  const ageMs = now.getTime() - new Date(topic.last_generated_at).getTime();
  return ageMs >= dueThresholdMs(topic.frequency);
}

/** The first daily cron tick at or after the given instant. */
function nextCronTickAfter(instant: Date): Date {
  const tick = new Date(
    Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate(),
      CRON_HOUR_UTC,
    ),
  );
  if (tick.getTime() < instant.getTime()) {
    tick.setUTCDate(tick.getUTCDate() + 1);
  }
  return tick;
}

/**
 * When the scheduler will next generate this topic, or null for manual
 * frequency / paused monitoring. This is the cron tick at which the topic
 * will first count as due.
 */
export function nextScheduledRun(
  frequency: UpdateFrequency,
  status: TopicStatus,
  lastGeneratedAt: string | null,
  now: Date = new Date(),
): Date | null {
  if (status !== "active" || frequency === "manual") return null;

  const dueAt = lastGeneratedAt
    ? new Date(Date.parse(lastGeneratedAt) + dueThresholdMs(frequency))
    : now;
  const earliest = dueAt.getTime() > now.getTime() ? dueAt : now;
  return nextCronTickAfter(earliest);
}

/** Whether an in-flight generation should block starting another one. */
export function isGenerationLocked(
  latestGenerating: Pick<Report, "status" | "created_at"> | null,
  now: Date = new Date(),
): boolean {
  if (!latestGenerating || latestGenerating.status !== "generating") {
    return false;
  }
  const ageMinutes =
    (now.getTime() - new Date(latestGenerating.created_at).getTime()) / 60000;
  // Older locks are treated as crashed runs and ignored.
  return ageMinutes < GENERATION_LOCK_MINUTES;
}

/** "29 Jul 2026, 8:00 AM" style timestamp used across the UI. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Normalizes the takeaway across formats: point-form array (current) or legacy paragraph string. */
export function takeawayPoints(
  takeaway: string | string[] | null | undefined,
): string[] {
  if (!takeaway) return [];
  const points = Array.isArray(takeaway) ? takeaway : [takeaway];
  return points.map((p) => p.trim()).filter(Boolean);
}

/** Formats elapsed milliseconds as m:ss.mmm (used by the generation timer). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/** Compact token count, e.g. "48.2k" or "1.3M". */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

/**
 * Cost label that keeps small per-step figures legible: scales decimals to
 * the magnitude instead of collapsing everything under a cent to "<$0.01".
 */
export function formatUsdDetailed(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "$0";
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value >= 0.001) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

/** Estimated cost label, e.g. "~$0.19" (or "<$0.01" for tiny runs). */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return `~$${value.toFixed(2)}`;
}

/** "48.2k tokens · ~$0.19" — null when there's nothing to show. */
export function formatUsageSummary(usage: ReportUsage | null | undefined): string | null {
  if (!usage || usage.calls === 0) return null;
  const tokens = usage.input_tokens + usage.output_tokens;
  const parts = [`${formatTokens(tokens)} tokens`];
  if (usage.estimated_cost_usd !== null) {
    parts.push(formatUsd(usage.estimated_cost_usd));
  }
  return parts.join(" · ");
}

/** 1-based pagination bounds for a Supabase .range() query. */
export function paginate(
  totalCount: number,
  requestedPage: number,
  pageSize: number,
): { page: number; totalPages: number; from: number; to: number } {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(
    Math.max(1, Math.floor(requestedPage) || 1),
    totalPages,
  );
  const from = (page - 1) * pageSize;
  return { page, totalPages, from, to: from + pageSize - 1 };
}

/** Compact relative age, e.g. "3h ago". */
export function formatRelativeAge(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
