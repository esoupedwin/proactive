import { describe, expect, it } from "vitest";
import { buildReportEmail, escapeHtml } from "@/lib/email";
import type { ReportSections } from "@/lib/types";

const base = {
  topicTitle: "UMNO to leave UG?",
  topicId: "topic-1",
  siteUrl: "https://proactive.example.com/",
};

function sections(overrides: Partial<ReportSections> = {}): ReportSections {
  return {
    latest_developments: [],
    community_reaction: [],
    practitioner_view: [],
    cross_source_takeaway: [],
    what_changed: [],
    no_meaningful_change: false,
    ...overrides,
  };
}

describe("buildReportEmail", () => {
  it("announces the report with the summary and briefing link", () => {
    const email = buildReportEmail({
      ...base,
      summary: "Fresh pledges keep UMNO in until GE16.",
      sections: sections(),
    });
    expect(email.subject).toBe("New report: UMNO to leave UG?");
    expect(email.text).toContain("Fresh pledges keep UMNO in until GE16.");
    // Trailing slash on the site URL must not double up.
    expect(email.text).toContain("https://proactive.example.com/topics/topic-1");
    expect(email.html).toContain("/topics/topic-1");
  });

  it("leads with the verdict on question-mode reports", () => {
    const email = buildReportEmail({
      ...base,
      summary: "Assessment holds.",
      sections: sections({
        verdict: {
          answer: "UMNO is unlikely to leave before GE16.",
          likelihood: "unlikely",
          confidence: "high",
          trend: "strengthened",
          rationale: [],
        },
      }),
    });
    expect(email.text).toContain(
      "Verdict: UMNO is unlikely to leave before GE16. (unlikely, high confidence)",
    );
  });

  it("marks no-meaningful-change runs as a check, not news", () => {
    const email = buildReportEmail({
      ...base,
      summary: null,
      sections: sections({ no_meaningful_change: true }),
    });
    expect(email.subject).toBe(
      "Checked: UMNO to leave UG? — nothing meaningful changed",
    );
    expect(email.text).toContain("nothing meaningful to add");
  });

  it("escapes model/user text in the HTML body", () => {
    const email = buildReportEmail({
      ...base,
      topicTitle: 'Topic <b>"bold"</b> & co',
      summary: "a < b",
      sections: sections(),
    });
    expect(email.html).toContain("Topic &lt;b&gt;&quot;bold&quot;&lt;/b&gt; &amp; co");
    expect(email.html).toContain("a &lt; b");
    expect(email.html).not.toContain("<b>");
  });
});

describe("escapeHtml", () => {
  it("escapes the four HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">&`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
  });
});
