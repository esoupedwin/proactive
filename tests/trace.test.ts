import { describe, expect, it } from "vitest";
import { createTraceCollector } from "@/lib/ai/trace";

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    stage: "search_plan",
    tier: "search" as const,
    model: "gpt-5-mini",
    instructions: "You are the planner.",
    input: "Topic: LLMs",
    used_web_search: false,
    web_search_calls: 0,
    input_tokens: 100,
    output_tokens: 20,
    started_at: "2026-07-26T08:00:00Z",
    duration_ms: 1200,
    ...overrides,
  };
}

describe("trace collector", () => {
  it("numbers calls in order and snapshots them", () => {
    const trace = createTraceCollector();
    trace.record(makeCall());
    trace.record(makeCall({ stage: "seek_result", used_web_search: true }));

    const snap = trace.snapshot();
    expect(snap.calls).toHaveLength(2);
    expect(snap.calls[0]!.index).toBe(1);
    expect(snap.calls[1]!.index).toBe(2);
    expect(snap.calls[1]!.stage).toBe("seek_result");
  });

  it("truncates oversized prompt text", () => {
    const trace = createTraceCollector();
    trace.record(makeCall({ input: "x".repeat(30_000) }));

    const stored = trace.snapshot().calls[0]!;
    expect(stored.input.length).toBeLessThan(21_000);
    expect(stored.input).toContain("[truncated");
    expect(stored.instructions).toBe("You are the planner.");
  });

  it("snapshot is a copy, not a live reference", () => {
    const trace = createTraceCollector();
    trace.record(makeCall());
    const snap = trace.snapshot();
    trace.record(makeCall({ stage: "report_draft" }));
    expect(snap.calls).toHaveLength(1);
  });
});
