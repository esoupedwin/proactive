import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  isGenerationLocked,
  isTopicDue,
  paginate,
} from "@/lib/reports";
import type { Topic } from "@/lib/types";

const NOW = new Date("2026-07-25T08:00:00Z");

function makeTopic(overrides: Partial<Topic>): Topic {
  return {
    id: "t1",
    user_id: "u1",
    title: "Topic",
    description: "desc",
    interest_areas: [],
    detail_level: "standard",
    frequency: "daily",
    status: "active",
    position: 0,
    last_generated_at: null,
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
