import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatElapsed,
  isGenerationLocked,
  isTopicDue,
  nextScheduledRun,
  nextUpdateLabel,
  paginate,
  takeawayPoints,
} from "@/lib/reports";
import type { Topic } from "@/lib/types";

const NOW = new Date("2026-07-25T08:00:00Z");

function makeTopic(overrides: Partial<Topic>): Topic {
  return {
    id: "t1",
    user_id: "u1",
    title: "Topic",
    description: "desc",
    interest_frame: [],
    watch_mode: "monitor",
    analytical_question: null,
    detail_level: "standard",
    frequency: "daily",
    status: "active",
    position: 0,
    news_query: null,
    last_generated_at: null,
    last_read_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("isTopicDue", () => {
  it("is never due when paused or manual", () => {
    expect(isTopicDue(makeTopic({ status: "paused" }), NOW)).toBe(false);
    expect(isTopicDue(makeTopic({ frequency: "manual" }), NOW)).toBe(false);
  });

  it("is due when never generated", () => {
    expect(isTopicDue(makeTopic({}), NOW)).toBe(true);
  });

  it("daily: due after ~23h, not before", () => {
    expect(
      isTopicDue(makeTopic({ last_generated_at: "2026-07-24T08:30:00Z" }), NOW),
    ).toBe(true);
    expect(
      isTopicDue(makeTopic({ last_generated_at: "2026-07-25T01:00:00Z" }), NOW),
    ).toBe(false);
  });

  it("every 3 days: due after ~71h, not after 2 days", () => {
    const every3 = { frequency: "every_3_days" as const };
    expect(
      isTopicDue(
        makeTopic({ ...every3, last_generated_at: "2026-07-22T08:30:00Z" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isTopicDue(
        makeTopic({ ...every3, last_generated_at: "2026-07-23T08:00:00Z" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("weekly: due after ~6.5 days, not after 2 days", () => {
    const weekly = { frequency: "weekly" as const };
    expect(
      isTopicDue(
        makeTopic({ ...weekly, last_generated_at: "2026-07-17T08:00:00Z" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isTopicDue(
        makeTopic({ ...weekly, last_generated_at: "2026-07-23T08:00:00Z" }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("formatElapsed", () => {
  it("formats minutes, seconds, and milliseconds", () => {
    expect(formatElapsed(0)).toBe("0:00.000");
    expect(formatElapsed(999)).toBe("0:00.999");
    expect(formatElapsed(61_005)).toBe("1:01.005");
    expect(formatElapsed(125_450.7)).toBe("2:05.450");
  });

  it("clamps negative values", () => {
    expect(formatElapsed(-50)).toBe("0:00.000");
  });
});

describe("nextScheduledRun", () => {
  // Cron fires daily at 08:00 UTC.
  it("is null for manual frequency or paused monitoring", () => {
    expect(nextScheduledRun("manual", "active", null, NOW)).toBeNull();
    expect(nextScheduledRun("daily", "paused", null, NOW)).toBeNull();
  });

  it("a never-generated topic runs at the next cron tick", () => {
    // NOW is exactly 08:00 UTC â€” that tick still counts.
    expect(nextScheduledRun("daily", "active", null, NOW)?.toISOString()).toBe(
      "2026-07-25T08:00:00.000Z",
    );
    // Just past the tick â†’ tomorrow.
    expect(
      nextScheduledRun(
        "daily",
        "active",
        null,
        new Date("2026-07-25T08:00:01Z"),
      )?.toISOString(),
    ).toBe("2026-07-26T08:00:00.000Z");
  });

  it("daily: runs at the first tick after last_generated_at + ~23h", () => {
    // Generated 07:30 today â†’ due 06:30 tomorrow â†’ tick tomorrow 08:00.
    expect(
      nextScheduledRun(
        "daily",
        "active",
        "2026-07-25T07:30:00Z",
        NOW,
      )?.toISOString(),
    ).toBe("2026-07-26T08:00:00.000Z");
  });

  it("every 3 days: runs at the first tick after last_generated_at + ~71h", () => {
    // Generated 25 Jul 08:00 â†’ due 28 Jul 07:00 â†’ tick 28 Jul 08:00.
    expect(
      nextScheduledRun(
        "every_3_days",
        "active",
        "2026-07-25T08:00:00Z",
        NOW,
      )?.toISOString(),
    ).toBe("2026-07-28T08:00:00.000Z");
  });

  it("weekly: runs at the first tick after last_generated_at + ~6.5 days", () => {
    // Generated 20 Jul 08:00 â†’ due 26 Jul 20:00 â†’ tick 27 Jul 08:00.
    expect(
      nextScheduledRun(
        "weekly",
        "active",
        "2026-07-20T08:00:00Z",
        NOW,
      )?.toISOString(),
    ).toBe("2026-07-27T08:00:00.000Z");
  });

  it("an overdue topic runs at the next tick from now, not a past tick", () => {
    expect(
      nextScheduledRun(
        "daily",
        "active",
        "2026-07-20T08:00:00Z",
        new Date("2026-07-25T09:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-07-26T08:00:00.000Z");
  });
});

describe("nextUpdateLabel", () => {
  it("names the next scheduled run for an active, scheduled topic", () => {
    // Generated 07:30 today → due 06:30 tomorrow → tick tomorrow 08:00.
    expect(nextUpdateLabel("daily", "active", "2026-07-25T07:30:00Z", NOW)).toBe(
      `Next update ${formatDateTime("2026-07-26T08:00:00.000Z")}`,
    );
  });

  it("says why there is no next run instead of going blank", () => {
    expect(nextUpdateLabel("daily", "paused", null, NOW)).toBe(
      "Paused — no automatic updates",
    );
    expect(nextUpdateLabel("manual", "active", null, NOW)).toBe(
      "Manual updates only",
    );
    // Paused wins: a paused manual topic is paused first.
    expect(nextUpdateLabel("manual", "paused", null, NOW)).toBe(
      "Paused — no automatic updates",
    );
  });

  it("covers a topic that has never generated", () => {
    expect(nextUpdateLabel("daily", "active", null, NOW)).toBe(
      `Next update ${formatDateTime("2026-07-25T08:00:00.000Z")}`,
    );
  });
});

describe("takeawayPoints", () => {
  it("passes point-form arrays through, dropping empty entries", () => {
    expect(takeawayPoints(["Point one.", " ", "Point two."])).toEqual([
      "Point one.",
      "Point two.",
    ]);
  });

  it("wraps a legacy paragraph string as a single point", () => {
    expect(takeawayPoints("One old paragraph.")).toEqual([
      "One old paragraph.",
    ]);
  });

  it("handles empty and missing values", () => {
    expect(takeawayPoints("")).toEqual([]);
    expect(takeawayPoints([])).toEqual([]);
    expect(takeawayPoints(null)).toEqual([]);
    expect(takeawayPoints(undefined)).toEqual([]);
  });
});

describe("paginate", () => {
  it("computes 1-based page bounds", () => {
    expect(paginate(25, 1, 10)).toEqual({ page: 1, totalPages: 3, from: 0, to: 9 });
    expect(paginate(25, 3, 10)).toEqual({ page: 3, totalPages: 3, from: 20, to: 29 });
  });

  it("clamps out-of-range and invalid pages", () => {
    expect(paginate(25, 99, 10).page).toBe(3);
    expect(paginate(25, 0, 10).page).toBe(1);
    expect(paginate(25, Number.NaN, 10).page).toBe(1);
  });

  it("handles empty result sets", () => {
    expect(paginate(0, 1, 10)).toEqual({ page: 1, totalPages: 1, from: 0, to: 9 });
  });
});

describe("isGenerationLocked", () => {
  it("not locked without a generating report", () => {
    expect(isGenerationLocked(null, NOW)).toBe(false);
    expect(
      isGenerationLocked(
        { status: "ready", created_at: "2026-07-25T07:59:00Z" },
        NOW,
      ),
    ).toBe(false);
  });

  it("locked by a fresh generating report", () => {
    expect(
      isGenerationLocked(
        { status: "generating", created_at: "2026-07-25T07:55:00Z" },
        NOW,
      ),
    ).toBe(true);
  });

  it("stale generating reports (crashed runs) do not lock", () => {
    expect(
      isGenerationLocked(
        { status: "generating", created_at: "2026-07-25T07:00:00Z" },
        NOW,
      ),
    ).toBe(false);
  });
});
