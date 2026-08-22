import { describe, expect, it } from "vitest";
import { isTopicUnread } from "@/lib/types";

describe("isTopicUnread", () => {
  it("is not unread when the topic has never produced a report", () => {
    expect(
      isTopicUnread({ last_generated_at: null, last_read_at: null }),
    ).toBe(false);
    // Nor when it was opened before ever producing one.
    expect(
      isTopicUnread({
        last_generated_at: null,
        last_read_at: "2026-08-01T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("is unread when a report exists and the briefing was never opened", () => {
    expect(
      isTopicUnread({
        last_generated_at: "2026-08-01T00:00:00Z",
        last_read_at: null,
      }),
    ).toBe(true);
  });

  it("is unread when the report landed after the last read", () => {
    expect(
      isTopicUnread({
        last_generated_at: "2026-08-02T00:00:00Z",
        last_read_at: "2026-08-01T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("is read once the briefing has been opened since the report", () => {
    expect(
      isTopicUnread({
        last_generated_at: "2026-08-01T00:00:00Z",
        last_read_at: "2026-08-02T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("is read when both stamps are the same instant", () => {
    expect(
      isTopicUnread({
        last_generated_at: "2026-08-01T00:00:00Z",
        last_read_at: "2026-08-01T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("compares instants, not strings, across Postgres and JS spellings", () => {
    // Postgres renders timestamptz with an offset; toISOString() writes "Z".
    // Lexically "+" sorts before "Z", so a naive string compare would call
    // this unread even though the read happened a full day later.
    expect(
      isTopicUnread({
        last_generated_at: "2026-08-01T00:00:00+00:00",
        last_read_at: "2026-08-02T00:00:00Z",
      }),
    ).toBe(false);
  });
});
