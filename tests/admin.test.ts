import { describe, expect, it } from "vitest";
import { isAdmin } from "@/lib/admin";

describe("isAdmin", () => {
  it("recognises the admin account regardless of case or padding", () => {
    expect(isAdmin({ email: "edwinang.email@gmail.com" })).toBe(true);
    expect(isAdmin({ email: "  Edwinang.Email@Gmail.com " })).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isAdmin({ email: "someone@example.com" })).toBe(false);
    // A near miss must not pass: matching is exact, not a prefix or suffix.
    expect(isAdmin({ email: "edwinang.email@gmail.com.evil.test" })).toBe(false);
  });

  it("rejects signed-out and email-less users", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin({ email: null })).toBe(false);
    expect(isAdmin({})).toBe(false);
  });
});
