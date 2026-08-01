import { describe, expect, it } from "vitest";
import { mergeScenarios, runAnalyst } from "@/lib/ai/experts/analyst";
import type { Llm, StructuredCallOptions } from "@/lib/ai/llm";
import type {
  AnalystMemoryData,
  ReportSections,
  Topic,
} from "@/lib/types";

const NOW = "2026-07-29T10:00:00Z";

const memory: AnalystMemoryData = {
  scenarios: [
    {
      id: "s1",
      scenario: "Audit scope narrows quietly",
      likelihood: "likely",
      status: "open",
      made_at: "2026-07-20T00:00:00Z",
      last_reviewed_at: "2026-07-20T00:00:00Z",
    },
    {
      id: "s2",
      scenario: "Snap election this year",
      likelihood: "unlikely",
      status: "open",
      made_at: "2026-07-20T00:00:00Z",
      last_reviewed_at: "2026-07-20T00:00:00Z",
    },
    {
      id: "s3",
      scenario: "Cabinet reshuffle in June",
      likelihood: "possible",
      status: "resolved",
      made_at: "2026-06-01T00:00:00Z",
      last_reviewed_at: "2026-07-01T00:00:00Z",
    },
  ],
};

const emptyAnalysis = { outlook: [], scenario_updates: [] };

describe("mergeScenarios", () => {
  it("preserves everything when nothing moved", () => {
    const merged = mergeScenarios(memory, emptyAnalysis, NOW);
    expect(merged.scenarios).toHaveLength(3);
  });

  it("applies status updates to tracked scenarios, case-insensitively", () => {
    const merged = mergeScenarios(
      memory,
      {
        ...emptyAnalysis,
        scenario_updates: [
          {
            scenario: "audit scope narrows quietly",
            status: "strengthened",
            note: "Committee membership changed as predicted.",
          },
        ],
      },
      NOW,
    );
    const updated = merged.scenarios.find((s) => s.id === "s1")!;
    expect(updated.status).toBe("strengthened");
    expect(updated.note).toContain("Committee");
    expect(updated.last_reviewed_at).toBe(NOW);
  });

  it("never reopens a resolved scenario", () => {
    const merged = mergeScenarios(
      memory,
      {
        outlook: [
          {
            scenario: "Cabinet reshuffle in June",
            likelihood: "likely",
            watch_for: [],
          },
        ],
        scenario_updates: [
          {
            scenario: "Cabinet reshuffle in June",
            status: "weakened",
            note: "irrelevant",
          },
        ],
      },
      NOW,
    );
    expect(merged.scenarios.find((s) => s.id === "s3")!.status).toBe("resolved");
  });

  it("adds new outlook scenarios as open and refreshes likelihood of tracked ones", () => {
    const merged = mergeScenarios(
      memory,
      {
        ...emptyAnalysis,
        outlook: [
          {
            scenario: "Snap election this year",
            likelihood: "possible",
            watch_for: ["party convention date"],
          },
          {
            scenario: "Coalition partner exits",
            likelihood: "unlikely",
            watch_for: ["public ultimatum"],
          },
        ],
      },
      NOW,
    );
    expect(merged.scenarios.find((s) => s.id === "s2")!.likelihood).toBe(
      "possible",
    );
    const fresh = merged.scenarios.find(
      (s) => s.scenario === "Coalition partner exits",
    )!;
    expect(fresh).toMatchObject({ status: "open", likelihood: "unlikely" });
    expect(fresh.id).toBeTruthy();
  });

  it("caps the track record with active scenarios kept ahead of resolved ones", () => {
    const big: AnalystMemoryData = {
      scenarios: Array.from({ length: 35 }, (_, i) => ({
        id: `old${i}`,
        scenario: `Scenario ${i}`,
        likelihood: "possible" as const,
        status: i % 2 === 0 ? ("resolved" as const) : ("open" as const),
        made_at: "2026-06-01T00:00:00Z",
        last_reviewed_at: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      })),
    };
    const merged = mergeScenarios(big, emptyAnalysis, NOW);
    expect(merged.scenarios).toHaveLength(30);
    // All active scenarios survive; only resolved history gets trimmed.
    expect(
      merged.scenarios.filter((s) => s.status !== "resolved"),
    ).toHaveLength(17);
  });
});

describe("runAnalyst", () => {
  const topic: Topic = {
    id: "t1",
    user_id: "u1",
    title: "Malaysia Politics",
    description: "Follow Malaysian political developments",
    interest_areas: [],
    detail_level: "standard",
    frequency: "daily",
    status: "active",
    position: 0,
    news_query: null,
    last_generated_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };

  const sections: ReportSections = {
    latest_developments: [{ text: "Audit committee reshuffled.", source_refs: [0] }],
    community_reaction: [],
    practitioner_view: [],
    cross_source_takeaway: "Accountability contest continues.",
    what_changed: [],
    no_meaningful_change: false,
  };

  it("sends open scenarios (not resolved) for reconciliation and merges the result", async () => {
    let captured: StructuredCallOptions<unknown> | null = null;
    const fakeLlm: Llm = {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        captured = options as StructuredCallOptions<unknown>;
        return options.schema.parse({
          assessment: "The reshuffle signals a narrowing of scope.",
          why_it_matters: ["Tests oversight independence."],
          outlook: [
            {
              scenario: "Audit report delayed past year end",
              likelihood: "possible",
              watch_for: ["missed publication deadline"],
            },
          ],
          scenario_updates: [
            {
              scenario: "Audit scope narrows quietly",
              status: "strengthened",
              note: "Reshuffle matches the predicted pattern.",
            },
          ],
          caveats: "Reddit claims about resignations remain unconfirmed.",
        });
      },
    };

    const result = await runAnalyst(
      fakeLlm,
      topic,
      sections,
      "Malaysia's domestic politics",
      memory,
      [{ source_type: "news", gist: "Committee reshuffled", novelty: "new", contradiction: "" }],
    );

    const input = JSON.parse(captured!.input) as {
      previously_tracked_scenarios: Array<{ scenario: string }>;
    };
    const sent = input.previously_tracked_scenarios.map((s) => s.scenario);
    expect(sent).toContain("Audit scope narrows quietly");
    expect(sent).not.toContain("Cabinet reshuffle in June"); // resolved â€” not re-litigated
    expect(captured!.tier).toBe("report");

    expect(result.analysis.assessment).toContain("reshuffle");
    expect(
      result.memory.scenarios.find((s) => s.scenario === "Audit scope narrows quietly")!
        .status,
    ).toBe("strengthened");
    expect(
      result.memory.scenarios.some(
        (s) => s.scenario === "Audit report delayed past year end",
      ),
    ).toBe(true);
  });
});
