import { describe, expect, it } from "vitest";
import { formatModelPrice } from "@/components/model-combobox";

describe("formatModelPrice", () => {
  it("shows both rates per million, trimming trailing zeros", () => {
    expect(formatModelPrice({ id: "x", prompt_per_m: 0.085, completion_per_m: 0.17 }))
      .toBe("$0.085 in · $0.17 out /M");
    expect(formatModelPrice({ id: "x", prompt_per_m: 0.05, completion_per_m: 0.1 }))
      .toBe("$0.05 in · $0.1 out /M");
    expect(formatModelPrice({ id: "x", prompt_per_m: 3, completion_per_m: 15 }))
      .toBe("$3 in · $15 out /M");
  });

  it("labels zero-priced models free and unpriced ones empty", () => {
    expect(formatModelPrice({ id: "x", prompt_per_m: 0, completion_per_m: 0 })).toBe("free");
    expect(formatModelPrice({ id: "x", prompt_per_m: null, completion_per_m: 2 })).toBe("");
  });
});
