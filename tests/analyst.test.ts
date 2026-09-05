import { describe, expect, it } from "vitest";
import { runAnalyst } from "@/lib/ai/experts/analyst";
import type { Llm, StructuredCallOptions } from "@/lib/ai/llm";
import { isAnalystCommentary } from "@/lib/types";
import type { AnalystAnalysis, ReportSections, Topic } from "@/lib/types";

const topic: Topic = {
  id: "t1",
  user_id: "u1",
  title: "Malaysia Politics",
  description: "Follow Malaysian political developments",
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
};

const sections: ReportSections = {
  latest_developments: [
    { text: "Audit committee reshuffled.", source_refs: [0] },
  ],
  community_reaction: [],
  practitioner_view: [],
  cross_source_takeaway: "Accountability contest continues.",
  what_changed: [],
  no_meaningful_change: false,
};

/** Question-mode sections: same report, but carrying a verdict. */
const questionSections: ReportSections = {
  ...sections,
  verdict: {
    answer: "The audit will likely be delayed past year end.",
    likelihood: "likely",
    confidence: "medium",
    trend: "baseline",
    rationale: [{ text: "Committee lost its quorum.", source_refs: [0] }],
  },
};

const COMMENTARY =
  "  The reshuffle narrows oversight scope without changing formal mandates.  ";

/** Captures the call and returns a fixed commentary. */
function fakeLlm(): { llm: Llm; captured: () => StructuredCallOptions<unknown> } {
  let seen: StructuredCallOptions<unknown> | null = null;
  return {
    llm: {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        seen = options as StructuredCallOptions<unknown>;
        return options.schema.parse({ commentary: COMMENTARY });
      },
    },
    captured: () => seen!,
  };
}

const sources = [
  {
    source_type: "news" as const,
    gist: "Committee reshuffled",
    novelty: "new",
    contradiction: "",
  },
];

describe("runAnalyst", () => {
  it("returns trimmed standalone commentary", async () => {
    const { llm } = fakeLlm();
    const result = await runAnalyst(
      llm,
      topic,
      sections,
      "Malaysia's domestic politics",
      sources,
    );

    expect(result.analysis).toEqual({
      commentary:
        "The reshuffle narrows oversight scope without changing formal mandates.",
    });
    expect(isAnalystCommentary(result.analysis)).toBe(true);
  });

  it("fences the user's specialization in the instructions", async () => {
    const { llm, captured } = fakeLlm();
    await runAnalyst(
      llm,
      topic,
      sections,
      "## Use language such as\n- increases bargaining leverage",
      sources,
    );

    const instructions = captured().instructions;
    expect(instructions).toContain(
      "<specialization>\n## Use language such as\n- increases bargaining leverage\n</specialization>",
    );
    // The prompt the user authored, not the retired one.
    expect(instructions).toContain(
      "Produce a concise commentary of approximately 2–5 sentences",
    );
    expect(instructions).not.toContain("scenario_updates");
  });

  it("sends the topic, report, sources and challenge material — no scenario track record", async () => {
    const { llm, captured } = fakeLlm();
    await runAnalyst(llm, topic, sections, "Malaysia's politics", sources);

    const input = JSON.parse(captured().input) as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual([
      "new_extracts",
      "previous_commentaries",
      "report",
      "sources",
      "topic",
    ]);
    expect(input.topic).toEqual({
      title: "Malaysia Politics",
      goal: "Follow Malaysian political developments",
    });
    expect(input.report).toContain("Audit committee reshuffled.");
    expect(input.sources).toHaveLength(1);
    // Defaults when the caller has no cursor feed yet.
    expect(input.new_extracts).toEqual([]);
    expect(input.previous_commentaries).toEqual([]);
  });

  it("passes new extracts (with cited flags) and prior commentaries through", async () => {
    const { llm, captured } = fakeLlm();
    await runAnalyst(
      llm,
      topic,
      sections,
      "Malaysia's politics",
      sources,
      [
        {
          source_type: "news",
          title: "Uncited audit story",
          factor: "Oversight",
          published_at: "2026-08-02",
          gist: "A second committee lost its quorum.",
          novelty: "new",
          contradiction: "",
          corroborations: 2,
          cited_in_report: false,
          recorded_at: "2026-08-03T00:00:00Z",
        },
      ],
      [{ at: "2026-08-01T00:00:00Z", commentary: "Earlier take." }],
    );

    const input = JSON.parse(captured().input) as {
      new_extracts: { title: string; cited_in_report: boolean }[];
      previous_commentaries: { commentary: string }[];
    };
    expect(input.new_extracts[0]!.title).toBe("Uncited audit story");
    expect(input.new_extracts[0]!.cited_in_report).toBe(false);
    expect(input.previous_commentaries[0]!.commentary).toBe("Earlier take.");

    const instructions = captured().instructions;
    expect(instructions).toContain("cited_in_report");
    expect(instructions).toContain("previous_commentaries");
  });

  it("asks for an explicit position on the assessment on monitor topics", async () => {
    const { llm, captured } = fakeLlm();
    await runAnalyst(llm, topic, sections, "focus", sources);

    const instructions = captured().instructions;
    expect(instructions).toContain("Make your own position clear");
    expect(instructions).not.toContain("agree with the report's verdict");
  });

  it("demands an outright agree/disagree on the verdict on question topics", async () => {
    const { llm, captured } = fakeLlm();
    await runAnalyst(llm, topic, questionSections, "focus", sources);

    const instructions = captured().instructions;
    expect(instructions).toContain(
      "Say outright whether you agree with the report's verdict",
    );
    expect(instructions).not.toContain("Make your own position clear");
    // The verdict itself reaches the analyst through the flattened report.
    const input = JSON.parse(captured().input) as { report: string };
    expect(input.report).toContain(
      "Verdict: The audit will likely be delayed past year end.",
    );
  });

  it("runs on the judgment tier — commentary quality is the product", async () => {
    const { llm, captured } = fakeLlm();
    await runAnalyst(llm, topic, sections, "focus", sources);
    expect(captured().tier).toBe("judgment");
  });

  it("rejects a response missing the commentary field", async () => {
    const llm: Llm = {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        return options.schema.parse({ assessment: "wrong shape" });
      },
    };
    await expect(
      runAnalyst(llm, topic, sections, "focus", sources),
    ).rejects.toThrow();
  });
});

describe("isAnalystCommentary", () => {
  it("narrows the current shape", () => {
    expect(isAnalystCommentary({ commentary: "A short read." })).toBe(true);
  });

  it("leaves analyses stored before the redesign to the legacy renderer", () => {
    const legacy: AnalystAnalysis = {
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
      caveats: "Reddit claims remain unconfirmed.",
    };
    expect(isAnalystCommentary(legacy)).toBe(false);
  });
});
