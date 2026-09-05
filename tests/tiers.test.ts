import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateTierOverrides,
  parseTierValue,
  resolveTierConfig,
  tierConfig,
  validateOverride,
} from "@/lib/ai/tiers";

const TIER_VARS = [
  "TIER_JUDGMENT",
  "TIER_SEARCH",
  "TIER_UTILITY",
  "TIER_EMBEDDING",
  "OPENAI_REPORT_MODEL",
  "OPENAI_SEARCH_MODEL",
  "OPENROUTER_SUMMARY_MODEL",
  "OPENAI_EMBEDDING_MODEL",
];

afterEach(() => {
  for (const name of TIER_VARS) delete process.env[name];
  invalidateTierOverrides();
  vi.restoreAllMocks();
});

describe("parseTierValue", () => {
  it("splits platform from model on the first colon only", () => {
    expect(parseTierValue("openrouter:deepseek/deepseek-v4-flash:online")).toEqual({
      platform: "openrouter",
      model: "deepseek/deepseek-v4-flash:online",
    });
    expect(parseTierValue("openai:gpt-5")).toEqual({
      platform: "openai",
      model: "gpt-5",
    });
  });

  it("rejects unknown platforms and empty models", () => {
    expect(parseTierValue("azure:gpt-5")).toBeNull();
    expect(parseTierValue("openai:")).toBeNull();
    expect(parseTierValue("gpt-5")).toBeNull();
  });
});

describe("tierConfig", () => {
  it("reads the TIER_* variable for each tier", () => {
    process.env.TIER_JUDGMENT = "openrouter:deepseek/deepseek-v4-pro";
    expect(tierConfig("judgment")).toEqual({
      platform: "openrouter",
      model: "deepseek/deepseek-v4-pro",
    });
  });

  it("falls back to legacy variables, then defaults", () => {
    process.env.OPENAI_REPORT_MODEL = "gpt-5.6-luna";
    expect(tierConfig("judgment")).toEqual({
      platform: "openai",
      model: "gpt-5.6-luna",
    });
    expect(tierConfig("search")).toEqual({
      platform: "openai",
      model: "gpt-5-mini",
    });
    expect(tierConfig("utility")).toEqual({
      platform: "openrouter",
      model: "deepseek/deepseek-v4-flash",
    });
  });

  it("keeps the search tier on OpenAI even when configured otherwise", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.TIER_SEARCH = "openrouter:deepseek/deepseek-v4-flash";
    process.env.OPENAI_SEARCH_MODEL = "gpt-5-mini";
    expect(tierConfig("search")).toEqual({
      platform: "openai",
      model: "gpt-5-mini",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("keeps embeddings on OpenAI likewise", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.TIER_EMBEDDING = "openrouter:some/embedder";
    expect(tierConfig("embedding")).toEqual({
      platform: "openai",
      model: "text-embedding-3-small",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("warns and defaults on a malformed value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.TIER_UTILITY = "deepseek-only-no-platform";
    expect(tierConfig("utility")).toEqual({
      platform: "openrouter",
      model: "deepseek/deepseek-v4-flash",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("allows the judgment and utility tiers on either platform", () => {
    process.env.TIER_JUDGMENT = "openai:gpt-5";
    process.env.TIER_UTILITY = "openai:gpt-5-mini";
    expect(tierConfig("judgment").platform).toBe("openai");
    expect(tierConfig("utility")).toEqual({
      platform: "openai",
      model: "gpt-5-mini",
    });
  });
});

describe("validateOverride", () => {
  it("accepts a well-formed entry and trims the model", () => {
    expect(
      validateOverride("judgment", { platform: "openrouter", model: " x/y " }),
    ).toEqual({ platform: "openrouter", model: "x/y" });
  });

  it("rejects malformed shapes, empty models, and locked platforms", () => {
    expect(validateOverride("judgment", null)).toBeNull();
    expect(validateOverride("judgment", { platform: "azure", model: "m" })).toBeNull();
    expect(validateOverride("judgment", { platform: "openai", model: " " })).toBeNull();
    // search is OpenAI-locked: an openrouter override is invalid even stored.
    expect(
      validateOverride("search", { platform: "openrouter", model: "x/y" }),
    ).toBeNull();
  });
});

describe("resolveTierConfig", () => {
  it("prefers a stored override over env config", async () => {
    process.env.TIER_JUDGMENT = "openai:gpt-5";
    const loader = vi.fn(async () => ({
      judgment: { platform: "openrouter", model: "deepseek/deepseek-v4-pro" },
    }));
    expect(await resolveTierConfig("judgment", loader)).toEqual({
      platform: "openrouter",
      model: "deepseek/deepseek-v4-pro",
    });
  });

  it("falls back to env for tiers without an override or with an invalid one", async () => {
    process.env.TIER_UTILITY = "openrouter:qwen/qwen3.7-flash";
    const loader = async () => ({
      search: { platform: "openrouter", model: "not-allowed" },
    });
    invalidateTierOverrides();
    expect(await resolveTierConfig("utility", loader)).toEqual({
      platform: "openrouter",
      model: "qwen/qwen3.7-flash",
    });
    // Invalid stored override (locked tier) → env config wins.
    expect((await resolveTierConfig("search", loader)).platform).toBe("openai");
  });

  it("survives a loader failure by using env config", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.TIER_JUDGMENT = "openai:gpt-5.6-luna";
    const loader = async () => {
      throw new Error("table missing");
    };
    expect(await resolveTierConfig("judgment", loader)).toEqual({
      platform: "openai",
      model: "gpt-5.6-luna",
    });
    expect(error).toHaveBeenCalled();
  });

  it("caches the loader result until invalidated", async () => {
    const loader = vi.fn(async () => null);
    await resolveTierConfig("judgment", loader);
    await resolveTierConfig("utility", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    invalidateTierOverrides();
    await resolveTierConfig("judgment", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
