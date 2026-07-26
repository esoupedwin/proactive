import { describe, expect, it } from "vitest";
import {
  capEntityMarkers,
  highlightEntities,
  keyEntitiesFromMemory,
  parseMarkedText,
  stripEntityMarkers,
} from "@/lib/entities";
import type { KnowledgeFact } from "@/lib/types";

describe("parseMarkedText", () => {
  it("splits marked text into bold and plain segments", () => {
    expect(parseMarkedText("Anthropic released **Claude Opus 5** today.")).toEqual([
      { text: "Anthropic released ", bold: false },
      { text: "Claude Opus 5", bold: true },
      { text: " today.", bold: false },
    ]);
  });

  it("returns one plain segment for unmarked text", () => {
    expect(parseMarkedText("no markers here")).toEqual([
      { text: "no markers here", bold: false },
    ]);
  });
});

describe("capEntityMarkers / stripEntityMarkers", () => {
  it("keeps the first N markers and unwraps the rest", () => {
    expect(capEntityMarkers("**A** and **B** and **C**", 2)).toBe(
      "**A** and **B** and C",
    );
  });

  it("strips all markers", () => {
    expect(stripEntityMarkers("**A** beats **B**")).toBe("A beats B");
  });
});

describe("keyEntitiesFromMemory", () => {
  const fact = (
    entities: string[],
    confidence: KnowledgeFact["confidence"],
  ): KnowledgeFact => ({ fact: "f", entities, confidence, source_note: "" });

  it("ranks by confidence-weighted frequency", () => {
    const entities = keyEntitiesFromMemory([
      fact(["Anthropic", "Claude Opus 5"], "high"),
      fact(["Google"], "low"),
      fact(["Anthropic"], "medium"),
    ]);
    expect(entities[0]).toBe("Anthropic"); // 3 + 2
    expect(entities).toContain("Claude Opus 5");
    expect(entities).toContain("Google");
  });

  it("dedupes case-insensitively, drops short names, and caps the list", () => {
    const entities = keyEntitiesFromMemory(
      [
        fact(["anthropic"], "high"),
        fact(["Anthropic", "AI"], "high"), // "AI" too short
        ...Array.from({ length: 10 }, (_, i) => fact([`Entity ${i}`], "low")),
      ],
      5,
    );
    expect(entities).toHaveLength(5);
    expect(entities.filter((e) => e.toLowerCase() === "anthropic")).toHaveLength(1);
    expect(entities).not.toContain("AI");
  });
});

describe("highlightEntities", () => {
  it("bolds case-insensitive, word-bounded matches", () => {
    expect(
      highlightEntities("Reports say ANTHROPIC leads.", ["Anthropic"]),
    ).toEqual([
      { text: "Reports say ", bold: false },
      { text: "ANTHROPIC", bold: true },
      { text: " leads.", bold: false },
    ]);
  });

  it("prefers the longest entity when names overlap", () => {
    const segments = highlightEntities("Claude Opus 5 shipped.", [
      "Claude",
      "Claude Opus 5",
    ]);
    expect(segments[0]).toEqual({ text: "Claude Opus 5", bold: true });
  });

  it("does not match inside words", () => {
    expect(highlightEntities("The solution works.", ["Sol"])).toEqual([
      { text: "The solution works.", bold: false },
    ]);
  });

  it("returns plain text when there are no usable entities", () => {
    expect(highlightEntities("text", [])).toEqual([{ text: "text", bold: false }]);
    expect(highlightEntities("text", ["ab"])).toEqual([
      { text: "text", bold: false },
    ]);
  });
});
