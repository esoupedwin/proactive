import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/routes";

describe("safeNextPath", () => {
  it("keeps an in-app path, query and all", () => {
    expect(safeNextPath("/topics/abc/extracts?factor=Political+Incentives")).toBe(
      "/topics/abc/extracts?factor=Political+Incentives",
    );
    expect(safeNextPath("/settings")).toBe("/settings");
  });

  it("falls back to the root when there is nothing to return to", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("refuses destinations that leave the app", () => {
    expect(safeNextPath("https://evil.test/phish")).toBe("/");
    expect(safeNextPath("//evil.test/phish")).toBe("/");
    // Browsers read a backslash here as a slash, so this escapes too.
    expect(safeNextPath("/\\evil.test/phish")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });
});
