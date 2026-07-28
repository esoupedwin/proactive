import { stripEntityMarkers } from "../../entities";
import type { ReportSections } from "../../types";

/** Flattens report sections into plain text for expert prompts. */
export function plainReportText(sections: ReportSections): string {
  const bullets = [
    ...sections.latest_developments,
    ...sections.community_reaction,
    ...sections.practitioner_view,
    ...sections.what_changed,
  ].map((b) => `- ${stripEntityMarkers(b.text)}`);
  return [stripEntityMarkers(sections.cross_source_takeaway), ...bullets].join(
    "\n",
  );
}
