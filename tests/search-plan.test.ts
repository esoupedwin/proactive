import { describe, expect, it } from "vitest";
import { maxExtractsPerRun, trackerInstructions } from "@/lib/agents/tracker/agent";
import { buildSearchPlan, renderSearchPlan } from "@/lib/agents/tracker/search-plan";
import { trackerMaxTurns } from "@/lib/agents/tracker/run";
import type { Topic } from "@/lib/types";

const NOW = new Date("2026-08-23T10:00:00Z");

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: "t1",
    user_id: "u1",
    title: "UMNO to leave UG?",
    description: "Track whether UMNO exits the Unity Government",
    interest_frame: [
      {
        name: "Political Incentives",
        key_question: "Does UMNO gain more by staying or leaving?",
        indicators: ["polling trends", "by-election performance"],
      },
      {
        name: "Coalition Arithmetic",
        key_question: "Can the UG survive without UMNO?",
        indicators: ["seat counts", "confidence votes", "MP defections"],
      },
    ],
    watch_mode: "question",
    analytical_question: "Will UMNO leave the Unity Government (UG)?",
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

describe("buildSearchPlan", () => {
  it("plans one search per factor plus one exploratory search", () => {
    const plan = buildSearchPlan(makeTopic(), NOW);
    expect(plan.map((p) => p.factor)).toEqual([
      "Political Incentives",
      "Coalition Arithmetic",
      null,
    ]);
  });

  it("anchors every query to the topic, then the factor's name and indicators, then the month", () => {
    const [incentives, arithmetic] = buildSearchPlan(makeTopic(), NOW);
    expect(incentives!.query).toBe(
      "umno leave ug political incentives polling trends by-election performance August 2026",
    );
    expect(arithmetic!.query).toBe(
      "umno leave ug coalition arithmetic seat counts confidence votes mp defections August 2026",
    );
  });

  it("leaves the key question out — it is prose for a reader, not search terms", () => {
    const [incentives] = buildSearchPlan(makeTopic(), NOW);
    expect(incentives!.query).not.toContain("gain");
    expect(incentives!.query).not.toContain("staying");
  });

  it("drops stop words and duplicates so the query stays dense", () => {
    const plan = buildSearchPlan(
      makeTopic({
        title: "The state of the Senate",
        interest_frame: [
          {
            name: "Senate map",
            key_question: "",
            indicators: ["the Senate polls", "senate fundraising"],
          },
        ],
      }),
      NOW,
    );
    expect(plan[0]!.query).toBe("state senate map polls fundraising August 2026");
  });

  it("caps a factor with many indicators so it cannot swamp the query", () => {
    const plan = buildSearchPlan(
      makeTopic({
        interest_frame: [
          {
            name: "Everything",
            key_question: "",
            indicators: ["one", "two", "three", "four", "five", "six"],
          },
        ],
      }),
      NOW,
    );
    expect(plan[0]!.query).toBe("umno leave ug everything one two three four August 2026");
  });

  it("drops abbreviation debris like the letters of 'e.g.'", () => {
    const plan = buildSearchPlan(
      makeTopic({
        interest_frame: [
          {
            name: "New releases (e.g. Alibaba, DeepSeek)",
            key_question: "",
            indicators: [],
          },
        ],
      }),
      NOW,
    );
    expect(plan[0]!.query).toBe("umno leave ug new releases alibaba deepseek August 2026");
  });

  it("falls back to the key question when the title already covers the factor", () => {
    const plan = buildSearchPlan(
      makeTopic({
        title: "Frontier LLMs & Agentic AI",
        interest_frame: [
          {
            name: "Agentic AI",
            key_question: "Which agent frameworks are gaining adoption?",
            indicators: [],
          },
        ],
      }),
      NOW,
    );
    expect(plan[0]!.query).toBe(
      "frontier llms agentic ai agent frameworks gaining adoption August 2026",
    );
  });

  it("skips blank factor rows the editor may leave behind", () => {
    const plan = buildSearchPlan(
      makeTopic({
        interest_frame: [
          { name: "Real factor", key_question: "", indicators: [] },
          { name: "  ", key_question: "", indicators: ["orphan"] },
        ],
      }),
      NOW,
    );
    expect(plan.map((p) => p.factor)).toEqual(["Real factor", null]);
  });

  it("still plans the exploratory search for a topic with no factors", () => {
    const plan = buildSearchPlan(makeTopic({ interest_frame: [] }), NOW);
    expect(plan).toEqual([
      { factor: null, query: "umno leave ug latest news August 2026" },
    ]);
  });
});

describe("renderSearchPlan", () => {
  it("labels each line with its factor and requires all of them", () => {
    const lines = renderSearchPlan(buildSearchPlan(makeTopic(), NOW));
    expect(lines[0]).toMatch(/run EVERY search/);
    expect(lines[1]).toMatch(/^- \[Political Incentives\] /);
    expect(lines[2]).toMatch(/^- \[Coalition Arithmetic\] /);
    expect(lines[3]).toMatch(/^- \[exploratory/);
  });
});

describe("trackerInstructions", () => {
  it("embeds the plan and sizes the budget to it", () => {
    const text = trackerInstructions(makeTopic(), [], NOW);
    expect(text).toContain("[Political Incentives] umno leave ug political incentives");
    expect(text).toContain("[Coalition Arithmetic] umno leave ug coalition arithmetic");
    expect(text).toContain("Budget: the 3 web searches in the plan");
    expect(text).toContain("Record at most 10 extracts");
    // The old discretionary planning line is gone — coverage is not optional.
    expect(text).not.toContain("Plan 2-4 angles");
  });

  it("scales the recording cap with the factor count, within bounds", () => {
    expect(maxExtractsPerRun(0)).toBe(10);
    expect(maxExtractsPerRun(5)).toBe(10);
    expect(maxExtractsPerRun(7)).toBe(14);
    expect(maxExtractsPerRun(10)).toBe(16);
  });
});

describe("trackerMaxTurns", () => {
  // The agent spends ~1 turn on the planned searches, 2 per extract it
  // records, and 1 closing — so the budget has to track the factor count.
  it("scales with the factors the plan will search", () => {
    expect(trackerMaxTurns(1)).toBe(8);
    expect(trackerMaxTurns(3)).toBe(12);
    expect(trackerMaxTurns(6)).toBe(18);
  });

  it("stays capped, because callers share a 300s function limit", () => {
    expect(trackerMaxTurns(7)).toBe(20);
    expect(trackerMaxTurns(10)).toBe(20);
  });

  it("gives a frameless topic room for its exploratory search", () => {
    expect(trackerMaxTurns(0)).toBe(8);
  });
});
