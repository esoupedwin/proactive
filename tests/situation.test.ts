import { describe, expect, it } from "vitest";
import {
  applySituationUpdates,
  renderSituation,
  situationSnapshot,
} from "@/lib/agents/reporter/situation";
import type { KnowledgeFact } from "@/lib/types";

const RULE: KnowledgeFact = {
  fact: "A party needs 218 of 435 seats to control the House.",
  kind: "rule",
  entities: ["House of Representatives"],
  confidence: "high",
  source_note: "House.gov",
  as_of: null,
};

const STATE: KnowledgeFact = {
  fact: "Republicans hold 53 Senate seats.",
  kind: "state",
  entities: ["Republicans", "Senate"],
  confidence: "high",
  source_note: "Senate.gov party division",
  as_of: "2026-08-01",
};

describe("applySituationUpdates", () => {
  it("revises a state fact and records the change", () => {
    const { facts, revised } = applySituationUpdates(
      [RULE, STATE],
      [
        {
          fact: STATE.fact,
          revised_fact: "Republicans hold 52 Senate seats.",
          as_of: "2026-08-20",
          extract_ids: ["e1"],
        },
      ],
    );
    expect(facts[1]!.fact).toBe("Republicans hold 52 Senate seats.");
    expect(facts[1]!.as_of).toBe("2026-08-20");
    expect(facts[1]!.source_note).toContain("was: Republicans hold 53");
    expect(revised).toEqual(new Set(["Republicans hold 52 Senate seats."]));
  });

  it("never revises a rule, even when asked to", () => {
    const { facts, revised } = applySituationUpdates(
      [RULE],
      [
        {
          fact: RULE.fact,
          revised_fact: "A party needs 200 seats.",
          as_of: null,
          extract_ids: ["e1"],
        },
      ],
    );
    expect(facts[0]).toEqual(RULE);
    expect(revised.size).toBe(0);
  });

  it("ignores updates to facts it does not hold — the loop cannot grow the base", () => {
    const { facts, revised } = applySituationUpdates(
      [STATE],
      [
        {
          fact: "Some fact that was never established.",
          revised_fact: "Now with a number.",
          as_of: null,
          extract_ids: ["e1"],
        },
      ],
    );
    expect(facts).toEqual([STATE]);
    expect(revised.size).toBe(0);
  });

  it("treats a no-op revision as unchanged", () => {
    const { facts, revised } = applySituationUpdates(
      [STATE],
      [{ fact: STATE.fact, revised_fact: STATE.fact, as_of: "2026-08-20", extract_ids: ["e1"] }],
    );
    expect(facts[0]!.as_of).toBe("2026-08-01");
    expect(revised.size).toBe(0);
  });

  it("keeps the prior as_of when the update has none", () => {
    const { facts } = applySituationUpdates(
      [STATE],
      [{ fact: STATE.fact, revised_fact: "Republicans hold 52 Senate seats.", as_of: null, extract_ids: ["e1"] }],
    );
    expect(facts[0]!.as_of).toBe("2026-08-01");
  });

  it("matches fact text after trimming", () => {
    const { revised } = applySituationUpdates(
      [STATE],
      [{ fact: `  ${STATE.fact}  `, revised_fact: "Republicans hold 52 Senate seats.", as_of: null, extract_ids: ["e1"] }],
    );
    expect(revised.size).toBe(1);
  });
});

describe("situationSnapshot", () => {
  it("orders rules before state and flags revisions", () => {
    const snap = situationSnapshot([STATE, RULE], new Set([STATE.fact]));
    expect(snap.map((f) => f.kind)).toEqual(["rule", "state"]);
    expect(snap[0]).toEqual({ fact: RULE.fact, kind: "rule", as_of: null });
    expect(snap[1]).toEqual({
      fact: STATE.fact,
      kind: "state",
      as_of: "2026-08-01",
      revised: true,
    });
  });

  it("treats facts without a kind (pre-feature) as state", () => {
    const legacy: KnowledgeFact = {
      fact: "Old fact",
      entities: [],
      confidence: "medium",
      source_note: "",
    };
    expect(situationSnapshot([legacy])[0]).toEqual({
      fact: "Old fact",
      kind: "state",
      as_of: null,
    });
  });
});

describe("renderSituation", () => {
  it("renders nothing for an empty base", () => {
    expect(renderSituation([])).toEqual([]);
  });

  it("groups rules and state and annotates dates and low confidence", () => {
    const lines = renderSituation([
      RULE,
      { ...STATE, confidence: "medium" },
    ]);
    expect(lines[0]).toMatch(/^Situation/);
    expect(lines).toContain("What the outcome requires:");
    expect(lines).toContain(`- ${RULE.fact}`);
    expect(lines).toContain("Where things stand:");
    expect(lines).toContain(
      `- ${STATE.fact} (as of 2026-08-01) [medium confidence]`,
    );
  });

  it("tells the loop it has no web search", () => {
    expect(renderSituation([RULE])[0]).toContain("you do not have web search");
  });
});
