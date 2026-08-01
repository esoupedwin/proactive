import { describe, expect, it } from "vitest";
import { buildSpeechScript } from "../src/lib/speech";
import type { ReportSections } from "../src/lib/types";

const bullet = (text: string) => ({ text, source_refs: [0] });

const sections: ReportSections = {
  cross_source_takeaway: "Two threads are moving at once",
  latest_developments: [bullet("**Kimi K3** was shown in Shanghai")],
  community_reaction: [bullet("Reddit is sceptical about the benchmarks.")],
  practitioner_view: [bullet("Practitioners report uneven reproducibility")],
  what_changed: [bullet("The earlier conclusion should be revised")],
  no_meaningful_change: false,
};

describe("buildSpeechScript", () => {
  it("opens with the topic and a spoken date", () => {
    const script = buildSpeechScript({
      topicTitle: "China's AI Landscape",
      sections,
      reportDate: "2026-07-31T07:35:00.000Z",
    });
    expect(script.split("\n\n")[0]).toBe(
      "China's AI Landscape. Your briefing from 31 July 2026.",
    );
  });

  it("strips entity markers and terminates every sentence", () => {
    const script = buildSpeechScript({ topicTitle: "T", sections });
    expect(script).not.toContain("**");
    expect(script).toContain("Kimi K3 was shown in Shanghai.");
    // Already-punctuated text must not gain a second full stop.
    expect(script).toContain("Reddit is sceptical about the benchmarks.");
    expect(script).not.toContain("benchmarks..");
  });

  it("announces each section so a listener can follow", () => {
    const script = buildSpeechScript({ topicTitle: "T", sections });
    for (const heading of [
      "Here's the overall takeaway.",
      "Now the latest developments.",
      "Here's what the community is saying on Reddit.",
      "And what practitioners are writing on Medium.",
      "Here's what changed since last time.",
    ]) {
      expect(script).toContain(heading);
    }
  });

  it("omits sections that have no content", () => {
    const script = buildSpeechScript({
      topicTitle: "T",
      sections: { ...sections, community_reaction: [], practitioner_view: [] },
    });
    expect(script).not.toContain("Reddit");
    expect(script).not.toContain("Medium");
    expect(script).toContain("Now the latest developments.");
  });

  it("states when nothing meaningful changed", () => {
    const script = buildSpeechScript({
      topicTitle: "T",
      sections: { ...sections, no_meaningful_change: true },
    });
    expect(script).toContain("Nothing significant has changed");
  });

  it("includes mentor tips, with expansions when present", () => {
    const script = buildSpeechScript({
      topicTitle: "T",
      sections,
      experts: [
        {
          expert: { kind: "mentor", name: "Mentor" },
          output: {
            output: {
              tips: [
                { id: "1", concept: "Moonshot AI", tip: "A Beijing startup" },
                { id: "2", concept: "MoE", tip: "Mixture of experts", more: "It routes tokens" },
              ],
            },
          },
        },
      ],
    });
    expect(script).toContain("From Mentor.");
    expect(script).toContain("Moonshot AI. A Beijing startup.");
    expect(script).toContain("It routes tokens.");
  });

  it("renders the analyst's assessment, outlook and revisited calls", () => {
    const script = buildSpeechScript({
      topicTitle: "T",
      sections,
      experts: [
        {
          expert: { kind: "analyst", name: "Analyst" },
          output: {
            output: {
              analysis: {
                assessment: "Evidence is thin",
                why_it_matters: ["Supply chains shift"],
                outlook: [
                  {
                    scenario: "Export controls tighten",
                    likelihood: "possible",
                    watch_for: ["New BIS rules", "Customs data"],
                  },
                ],
                scenario_updates: [
                  { scenario: "Open weights", status: "weakened", note: "No release yet" },
                ],
                caveats: "Sourcing is uneven",
              },
            },
          },
        },
      ],
    });
    expect(script).toContain("From Analyst.");
    expect(script).toContain("Evidence is thin.");
    expect(script).toContain("Why this matters.");
    expect(script).toContain("Possible. Export controls tighten.");
    expect(script).toContain("Watch for: New BIS rules; Customs data.");
    expect(script).toContain("Open weights — weakened.");
    expect(script).toContain("One caveat. Sourcing is uneven.");
  });

  it("skips experts that have not run yet", () => {
    const script = buildSpeechScript({
      topicTitle: "T",
      sections,
      experts: [{ expert: { kind: "mentor", name: "Mentor" }, output: null }],
    });
    expect(script).not.toContain("From Mentor.");
  });

  it("closes the briefing", () => {
    const script = buildSpeechScript({ topicTitle: "T", sections });
    expect(script.trimEnd().endsWith("That's the end of your briefing.")).toBe(true);
  });
});
