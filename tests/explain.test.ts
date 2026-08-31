import { describe, expect, it } from "vitest";
import { explainSelection } from "@/lib/ai/explain";
import type { Llm, StructuredCallOptions } from "@/lib/ai/llm";

const topic = {
  title: "Malaysia Politics",
  description: "Follow Malaysian political developments",
};

function fakeLlm(): { llm: Llm; captured: () => StructuredCallOptions<unknown> } {
  let seen: StructuredCallOptions<unknown> | null = null;
  return {
    llm: {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        seen = options as StructuredCallOptions<unknown>;
        return options.schema.parse({
          explanation: "  A short explanation.  ",
        });
      },
    },
    captured: () => seen!,
  };
}

describe("explainSelection", () => {
  it("runs on the search tier with web search available, and trims the answer", async () => {
    const { llm, captured } = fakeLlm();
    const result = await explainSelection(
      llm,
      topic,
      "PAU resolution",
      "He pointed to the party's PAU resolution as binding.",
    );

    expect(captured().tier).toBe("search");
    expect(captured().useWebSearch).toBe(true);
    const input = JSON.parse(captured().input) as Record<string, unknown>;
    expect(input.highlighted).toBe("PAU resolution");
    expect(input.surrounding_passage).toContain("binding");
    expect(result.explanation).toBe("A short explanation.");
  });

  it("caps oversized selections and context instead of forwarding them", async () => {
    const { llm, captured } = fakeLlm();
    await explainSelection(llm, topic, "x".repeat(5000), "y".repeat(5000));

    const input = JSON.parse(captured().input) as {
      highlighted: string;
      surrounding_passage: string;
    };
    expect(input.highlighted.length).toBe(600);
    expect(input.surrounding_passage.length).toBe(800);
  });
});
