import { capEntityMarkers } from "../../entities";
import type { ExtractRecord, ReportBullet, ReportSections } from "../../types";
import type {
  CitedBullet,
  QuestionReporterFinal,
  ReportDraft,
  ReporterFinal,
} from "../schemas";

/**
 * Deterministic conversion from the Reporter agent's output (extract-id
 * citations) to the app's positional-citation contract: the distinct cited
 * extracts, in first-appearance order, become the report's ordered sources
 * snapshot, and extract_ids become indexes into it.
 */

const MAX_ENTITY_MARKS_PER_BULLET = 2;

/**
 * Drops bullets whose source_refs point outside the snapshot
 * (anti-hallucination guard) and caps inline **entity** markers so an
 * over-eager model can't bold everything.
 */
export function sanitizeDraft(
  draft: ReportDraft,
  sourceCount: number,
): ReportDraft {
  const clampBullets = (bullets: ReportDraft["latest_developments"]) =>
    bullets
      .map((b) => ({
        ...b,
        text: capEntityMarkers(b.text, MAX_ENTITY_MARKS_PER_BULLET),
        source_refs: b.source_refs.filter((r) => r >= 0 && r < sourceCount),
      }))
      // A factual bullet with no surviving citation is dropped, unless there
      // are no sources at all (e.g. "what changed" narrative on empty runs).
      .filter((b) => b.source_refs.length > 0 || sourceCount === 0);

  return {
    ...draft,
    latest_developments: clampBullets(draft.latest_developments),
    community_reaction: clampBullets(draft.community_reaction),
    practitioner_view: clampBullets(draft.practitioner_view),
    cover_source_ref:
      draft.cover_source_ref !== null &&
      draft.cover_source_ref >= 0 &&
      draft.cover_source_ref < sourceCount
        ? draft.cover_source_ref
        : null,
    cross_source_takeaway: draft.cross_source_takeaway.map((point) =>
      capEntityMarkers(point, MAX_ENTITY_MARKS_PER_BULLET),
    ),
    // what_changed may legitimately reference nothing (narrative comparison).
    what_changed: draft.what_changed.map((b) => ({
      ...b,
      text: capEntityMarkers(b.text, MAX_ENTITY_MARKS_PER_BULLET),
      source_refs: b.source_refs.filter((r) => r >= 0 && r < sourceCount),
    })),
  };
}

export interface ComposedReport {
  sections: ReportSections;
  summary: string;
  /** Cited extracts in citation-index order — the report's sources snapshot. */
  snapshot: ExtractRecord[];
  coverRef: number | null;
}

export function composeReport(
  final: ReporterFinal,
  extractsById: Map<string, ExtractRecord>,
): ComposedReport {
  // Distinct cited ids in first-appearance order; ids the agent invented
  // (not served by any tool) are dropped.
  const order: string[] = [];
  const seen = new Set<string>();
  const note = (id: string) => {
    if (!seen.has(id) && extractsById.has(id)) {
      seen.add(id);
      order.push(id);
    }
  };
  const noteBullets = (bullets: CitedBullet[]) =>
    bullets.forEach((b) => b.extract_ids.forEach(note));
  noteBullets(final.latest_developments);
  noteBullets(final.community_reaction);
  noteBullets(final.practitioner_view);
  noteBullets(final.what_changed);
  // The cover nominee joins the snapshot even if no bullet cites it, so
  // hero_image.source_ref resolves.
  if (final.cover_extract_id) note(final.cover_extract_id);

  const indexOf = new Map(order.map((id, i) => [id, i]));
  const toBullet = (b: CitedBullet) => ({
    text: b.text,
    source_refs: b.extract_ids
      .filter((id) => indexOf.has(id))
      .map((id) => indexOf.get(id)!),
  });

  const draft: ReportDraft = {
    latest_developments: final.latest_developments.map(toBullet),
    community_reaction: final.community_reaction.map(toBullet),
    practitioner_view: final.practitioner_view.map(toBullet),
    cross_source_takeaway: final.cross_source_takeaway,
    what_changed: final.what_changed.map(toBullet),
    no_meaningful_change: final.no_meaningful_change,
    summary: final.summary,
    cover_source_ref:
      final.cover_extract_id !== null
        ? (indexOf.get(final.cover_extract_id) ?? null)
        : null,
  };

  const snapshot = order.map((id) => extractsById.get(id)!);
  const clean = sanitizeDraft(draft, snapshot.length);

  return {
    sections: {
      latest_developments: clean.latest_developments,
      community_reaction: clean.community_reaction,
      practitioner_view: clean.practitioner_view,
      cross_source_takeaway: clean.cross_source_takeaway,
      what_changed: clean.what_changed,
      no_meaningful_change: clean.no_meaningful_change,
    },
    summary: clean.summary,
    snapshot,
    coverRef: clean.cover_source_ref,
  };
}

/**
 * Question-mode counterpart of composeReport: verdict + per-factor
 * assessments instead of the briefing sections. Same citation contract —
 * cited extracts become the ordered sources snapshot.
 */
export function composeQuestionReport(
  final: QuestionReporterFinal,
  extractsById: Map<string, ExtractRecord>,
): ComposedReport {
  const order: string[] = [];
  const seen = new Set<string>();
  const note = (id: string) => {
    if (!seen.has(id) && extractsById.has(id)) {
      seen.add(id);
      order.push(id);
    }
  };
  const noteBullets = (bullets: CitedBullet[]) =>
    bullets.forEach((b) => b.extract_ids.forEach(note));
  noteBullets(final.verdict.rationale);
  final.factor_assessments.forEach((fa) => noteBullets(fa.bullets));
  noteBullets(final.what_changed);
  if (final.cover_extract_id) note(final.cover_extract_id);

  const indexOf = new Map(order.map((id, i) => [id, i]));
  const sourceCount = order.length;
  const toBullet = (b: CitedBullet): ReportBullet => ({
    text: capEntityMarkers(b.text, 2),
    source_refs: b.extract_ids
      .filter((id) => indexOf.has(id))
      .map((id) => indexOf.get(id)!),
  });
  // Evidence bullets need a surviving citation (anti-hallucination guard),
  // unless there are no sources at all (e.g. a baseline with an empty store).
  const evidenceBullets = (bullets: CitedBullet[]) =>
    bullets
      .map(toBullet)
      .filter((b) => b.source_refs.length > 0 || sourceCount === 0);

  const coverRef =
    final.cover_extract_id !== null
      ? (indexOf.get(final.cover_extract_id) ?? null)
      : null;

  return {
    sections: {
      latest_developments: [],
      community_reaction: [],
      practitioner_view: [],
      cross_source_takeaway: [],
      what_changed: final.what_changed.map(toBullet),
      no_meaningful_change: final.no_meaningful_change,
      verdict: {
        answer: capEntityMarkers(final.verdict.answer, 2),
        likelihood: final.verdict.likelihood,
        confidence: final.verdict.confidence,
        trend: final.verdict.trend,
        rationale: evidenceBullets(final.verdict.rationale),
      },
      factor_assessments: final.factor_assessments
        .map((fa) => ({ factor: fa.factor, bullets: evidenceBullets(fa.bullets) }))
        .filter((fa) => fa.bullets.length > 0),
    },
    summary: final.summary,
    snapshot: order.map((id) => extractsById.get(id)!),
    coverRef,
  };
}
