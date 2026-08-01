import { describe, expect, it, vi } from "vitest";
import { runExpertOnReport } from "../src/lib/ai/experts/runner";
import type { Expert, ReportSections, Topic } from "../src/lib/types";

const sections = (overrides: Partial<ReportSections> = {}): ReportSections => ({
  cross_source_takeaway: "Takeaway",
  latest_developments: [{ text: "Something happened", source_refs: [0] }],
  community_reaction: [],
  practitioner_view: [],
  what_changed: [{ text: "A shift", source_refs: [0] }],
  no_meaningful_change: false,
  ...overrides,
});

/**
 * Minimal Supabase stub: only the reads runExpertOnReport performs before it
 * would reach the model. `from()` records which tables were touched.
 */
function stubSupabase(reportSections: ReportSections | null) {
  const touched: string[] = [];
  const supabase = {
    from(table: string) {
      touched.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () =>
          table === "reports"
            ? { data: { sections: reportSections } }
            : { data: null },
        upsert: () => chain,
        single: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  };
  return { supabase, touched };
}

const expert = {
  id: "e1",
  topic_id: "t1",
  user_id: "u1",
  kind: "mentor",
  name: "Mentor",
  status: "active",
  config: { level: "basic" },
  created_at: "2026-07-31T00:00:00Z",
  updated_at: "2026-07-31T00:00:00Z",
} as unknown as Expert;

const topic = { id: "t1", user_id: "u1", title: "T" } as unknown as Topic;

describe("runExpertOnReport", () => {
  it("does not run when the report reported no meaningful change", async () => {
    const { supabase, touched } = stubSupabase(
      sections({ no_meaningful_change: true }),
    );
    const llm = { structured: vi.fn() };

    const result = await runExpertOnReport({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      llm,
      expert,
      topic,
      reportId: "r1",
    });

    expect(result).toBeNull();
    // No model call, and it never reached expert memory.
    expect(llm.structured).not.toHaveBeenCalled();
    expect(touched).not.toContain("expert_memory");
  });

  it("does not run when the report has no sections", async () => {
    const { supabase } = stubSupabase(null);
    const llm = { structured: vi.fn() };

    const result = await runExpertOnReport({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      llm,
      expert,
      topic,
      reportId: "r1",
    });

    expect(result).toBeNull();
    expect(llm.structured).not.toHaveBeenCalled();
  });

  it("proceeds past the guard for a report with real change", async () => {
    const { supabase, touched } = stubSupabase(sections());
    const llm = { structured: vi.fn().mockRejectedValue(new Error("stop here")) };

    await expect(
      runExpertOnReport({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        llm,
        expert,
        topic,
        reportId: "r1",
      }),
    ).rejects.toThrow("stop here");

    // The guard let it through: it read expert memory and called the model.
    expect(touched).toContain("expert_memory");
    expect(llm.structured).toHaveBeenCalled();
  });
});
