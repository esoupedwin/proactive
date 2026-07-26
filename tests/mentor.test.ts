import { describe, expect, it } from "vitest";
import {
  knownConcepts,
  mergeTaughtConcepts,
  revisitConcepts,
  runMentor,
} from "@/lib/ai/experts/mentor";
import type { Llm, StructuredCallOptions } from "@/lib/ai/llm";
import type {
  MentorMemoryData,
  ReportSections,
  Topic,
} from "@/lib/types";

const NOW = "2026-07-26T10:00:00Z";

const memory: MentorMemoryData = {
  taught: [
    { concept: "JS-SEZ", status: "known", times: 2, last_taught_at: "2026-07-20T00:00:00Z" },
    { concept: "KWAP", status: "revisit", times: 1, last_taught_at: "2026-07-21T00:00:00Z" },
    { concept: "RTS Link", status: "taught", times: 1, last_taught_at: "2026-07-22T00:00:00Z" },
  ],
};

describe("mentor memory helpers", () => {
  it("separates known and revisit concepts", () => {
    expect(knownConcepts(memory)).toEqual(["JS-SEZ"]);
    expect(revisitConcepts(memory)).toEqual(["KWAP"]);
  });

  it("merges new tips and re-teaches revisit concepts back to taught", () => {
    const merged = mergeTaughtConcepts(
      memory,
      [{ concept: "kwap" }, { concept: "Madani framework" }],
      NOW,
    );
    const kwap = merged.taught.find((t) => t.concept === "KWAP")!;
    expect(kwap.status).toBe("taught");
    expect(kwap.times).toBe(2);
    expect(kwap.last_taught_at).toBe(NOW);

    const fresh = merged.taught.find((t) => t.concept === "Madani framework")!;
    expect(fresh).toMatchObject({ status: "taught", times: 1 });
  });

  it("never downgrades a concept the user marked as known", () => {
    const merged = mergeTaughtConcepts(memory, [{ concept: "JS-SEZ" }], NOW);
    expect(merged.taught.find((t) => t.concept === "JS-SEZ")!.status).toBe(
      "known",
    );
  });
});

describe("runMentor", () => {
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
    last_generated_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };

  const sections: ReportSections = {
    latest_developments: [{ text: "JS-SEZ implementation advanced.", source_refs: [0] }],
    community_reaction: [],
    practitioner_view: [],
    cross_source_takeaway: "Coalition stability in focus.",
    what_changed: [],
    no_meaningful_change: false,
  };

  it("excludes known concepts from the prompt and merges taught memory", async () => {
    let capturedInput = "";
    const fakeLlm: Llm = {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        capturedInput = options.input;
        return options.schema.parse({
          tips: [{ concept: "Madani framework", tip: "It is the governing agenda." }],
        });
      },
    };

    const result = await runMentor(fakeLlm, topic, sections, "basic", memory);

    // Known list forwarded so the model can avoid re-teaching.
    expect(capturedInput).toContain("JS-SEZ");
    expect(JSON.parse(capturedInput).already_known).toEqual(["JS-SEZ"]);
    expect(JSON.parse(capturedInput).asked_to_revisit).toEqual(["KWAP"]);

    expect(result.tips).toHaveLength(1);
    expect(result.tips[0]!.id).toBeTruthy();
    expect(
      result.memory.taught.find((t) => t.concept === "Madani framework"),
    ).toBeTruthy();
  });
});
