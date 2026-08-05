import { stripEntityMarkers } from "../../entities";
import { takeawayPoints } from "../../reports";
import type { ReportSections } from "../../types";

/** Flattens report sections into plain text for expert prompts. */
export function plainReportText(sections: ReportSections): string {
  // Trending-mode reports: the attention map, one block per subject.
  if (sections.trending) {
    const lines = [
      ...sections.trending.flatMap((item) => [
        `${stripEntityMarkers(item.subject)} (${item.momentum}) — mood: ${stripEntityMarkers(item.mood)}`,
        ...item.bullets.map((b) => `- ${stripEntityMarkers(b.text)}`),
      ]),
      ...sections.what_changed.map((b) => `- ${stripEntityMarkers(b.text)}`),
    ];
    return lines.join("\n");
  }
  // Question-mode assessments: verdict first, then the per-factor evidence.
  if (sections.verdict) {
    const v = sections.verdict;
    const lines = [
      `Verdict: ${stripEntityMarkers(v.answer)} (${v.likelihood}, ${v.confidence} confidence, ${v.trend})`,
      ...v.rationale.map((b) => `- ${stripEntityMarkers(b.text)}`),
      ...(sections.factor_assessments ?? []).flatMap((fa) => [
        `${fa.factor}:`,
        ...fa.bullets.map((b) => `- ${stripEntityMarkers(b.text)}`),
      ]),
      ...sections.what_changed.map((b) => `- ${stripEntityMarkers(b.text)}`),
    ];
    return lines.join("\n");
  }
  const bullets = [
    ...sections.latest_developments,
    ...sections.community_reaction,
    ...sections.practitioner_view,
    ...sections.what_changed,
  ].map((b) => `- ${stripEntityMarkers(b.text)}`);
  const takeaway = takeawayPoints(sections.cross_source_takeaway).map(
    (p) => stripEntityMarkers(p),
  );
  return [...takeaway, ...bullets].join("\n");
}
