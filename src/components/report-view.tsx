import { Fragment } from "react";
import {
  hasEntityMarkers,
  highlightEntities,
  parseMarkedText,
} from "@/lib/entities";
import { takeawayPoints } from "@/lib/reports";
import type {
  QuestionVerdict,
  ReportBullet,
  ReportSections,
  ScenarioLikelihood,
  Source,
  VerdictTrend,
} from "@/lib/types";
import { HeroImage } from "./hero-image";

/**
 * Bullet/paragraph text with key entities bolded. New reports carry inline
 * **markers** chosen by the reporter; older reports fall back to matching
 * the topic's key entities from knowledge memory.
 */
function RichText({ text, entities }: { text: string; entities: string[] }) {
  const segments = /\*\*[^*]+\*\*/.test(text)
    ? parseMarkedText(text)
    : highlightEntities(text, entities);
  return (
    <>
      {segments.map((segment, i) =>
        segment.bold ? (
          <strong key={i} className="font-semibold">
            {segment.text}
          </strong>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Renders one structured report in the editorial briefing style. */
export function ReportView({
  sections,
  sources,
  fallbackEntities = [],
  question,
}: {
  sections: ReportSections;
  sources: Source[];
  /** Key entities from topic memory, used only when the report has no inline markers. */
  fallbackEntities?: string[];
  /** The topic's analytical question — shown above question-mode verdicts. */
  question?: string | null;
}) {
  // If the reporter marked entities itself, trust its judgment everywhere.
  const entities = hasEntityMarkers(sections) ? [] : fallbackEntities;
  // Question-mode reports render as an assessment, not a briefing.
  if (sections.verdict) {
    return (
      <QuestionReportView
        sections={sections}
        verdict={sections.verdict}
        sources={sources}
        entities={entities}
        question={question}
      />
    );
  }
  if (sections.no_meaningful_change) {
    return (
      <div className="space-y-6">
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-ink-soft">
          Nothing significant has changed for this topic since the previous
          update.
        </p>
        <Section
          title="What Changed"
          bullets={sections.what_changed}
          sources={sources}
          entities={entities}
        />
      </div>
    );
  }

  const hero = sections.hero_image;
  const heroSource =
    hero && hero.source_ref >= 0 && hero.source_ref < sources.length
      ? sources[hero.source_ref]!
      : null;

  return (
    <div className="space-y-7">
      {hero && (
        <HeroImage
          url={hero.url}
          alt={hero.alt}
          description={
            hero.description ??
            (heroSource ? `From “${heroSource.title}”` : null)
          }
          credit={heroSource ? (heroSource.publisher ?? heroSource.title) : null}
          creditUrl={heroSource?.url ?? null}
        />
      )}
      {takeawayPoints(sections.cross_source_takeaway).length > 0 && (
        <section aria-label="Overall Takeaway">
          <h2 className="mb-2 border-b border-rule pb-1 text-sm font-bold uppercase tracking-wide">
            Overall Takeaway
          </h2>
          <ul className="space-y-2.5">
            {takeawayPoints(sections.cross_source_takeaway).map((point, i) => (
              <li key={i} className="flex gap-2 text-[15px] leading-relaxed">
                <span aria-hidden className="select-none text-ink-faint">
                  •
                </span>
                <span>
                  <RichText text={point} entities={entities} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Section
        title="Latest Developments"
        bullets={sections.latest_developments}
        sources={sources}
        entities={entities}
      />
      <Section
        title="Community Reaction — Reddit"
        bullets={sections.community_reaction}
        sources={sources}
        entities={entities}
      />
      <Section
        title="What Practitioners Are Writing — Medium"
        bullets={sections.practitioner_view}
        sources={sources}
        entities={entities}
      />
      <Section
        title="What Changed"
        bullets={sections.what_changed}
        sources={sources}
        entities={entities}
      />
    </div>
  );
}

const LIKELIHOOD_LABEL: Record<ScenarioLikelihood, string> = {
  likely: "Likely",
  possible: "Possible",
  unlikely: "Unlikely",
};

// "vs last report" is spelled out because the trend describes how the VERDICT
// moved since the previous assessment — without it, a chip like "Weakened" is
// easily misread as part of the answer itself (e.g. for a question that is
// about something strengthening or weakening).
const TREND_LABEL: Record<VerdictTrend, string> = {
  baseline: "Baseline assessment",
  strengthened: "vs last report: Strengthened",
  weakened: "vs last report: Weakened",
  reversed: "vs last report: Reversed",
  unchanged: "vs last report: Unchanged",
};

const TREND_CLASS: Record<VerdictTrend, string> = {
  baseline: "border-rule text-ink-soft",
  strengthened: "border-emerald-300 bg-emerald-50 text-emerald-900",
  weakened: "border-amber-300 bg-amber-50 text-amber-900",
  reversed: "border-red-300 bg-red-50 text-red-900",
  unchanged: "border-rule text-ink-soft",
};

/** Question-mode layout: verdict, per-factor assessments, what changed. */
function QuestionReportView({
  sections,
  verdict,
  sources,
  entities,
  question,
}: {
  sections: ReportSections;
  verdict: QuestionVerdict;
  sources: Source[];
  entities: string[];
  question?: string | null;
}) {
  const hero = sections.hero_image;
  const heroSource =
    hero && hero.source_ref >= 0 && hero.source_ref < sources.length
      ? sources[hero.source_ref]!
      : null;

  return (
    <div className="space-y-7">
      {sections.no_meaningful_change && (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-ink-soft">
          Nothing new bears on this question since the previous update — the
          assessment below stands.
        </p>
      )}

      {hero && !sections.no_meaningful_change && (
        <HeroImage
          url={hero.url}
          alt={hero.alt}
          description={
            hero.description ??
            (heroSource ? `From “${heroSource.title}”` : null)
          }
          credit={heroSource ? (heroSource.publisher ?? heroSource.title) : null}
          creditUrl={heroSource?.url ?? null}
        />
      )}

      <section
        aria-label="Assessment"
        className="rounded-md border border-rule bg-neutral-50 px-4 py-4"
      >
        {question && (
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            {question}
          </p>
        )}
        <p className="mt-2 text-lg font-semibold leading-snug">
          <RichText text={verdict.answer} entities={entities} />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="rounded-full border border-rule px-2.5 py-0.5">
            {LIKELIHOOD_LABEL[verdict.likelihood]}
          </span>
          <span className="rounded-full border border-rule px-2.5 py-0.5">
            {verdict.confidence} confidence
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 ${TREND_CLASS[verdict.trend]}`}
          >
            {TREND_LABEL[verdict.trend]}
          </span>
        </div>
        {verdict.rationale.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {verdict.rationale.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-[15px] leading-relaxed">
                <span aria-hidden className="select-none text-ink-faint">
                  •
                </span>
                <span>
                  <RichText text={bullet.text} entities={entities} />
                  <SourceRefs refs={bullet.source_refs} sources={sources} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(sections.factor_assessments ?? []).map((fa) => (
        <Section
          key={fa.factor}
          title={fa.factor}
          bullets={fa.bullets}
          sources={sources}
          entities={entities}
        />
      ))}

      <Section
        title="What Changed"
        bullets={sections.what_changed}
        sources={sources}
        entities={entities}
      />
    </div>
  );
}

function Section({
  title,
  bullets,
  sources,
  entities,
}: {
  title: string;
  bullets: ReportBullet[];
  sources: Source[];
  entities: string[];
}) {
  if (bullets.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-2 border-b border-rule pb-1 text-sm font-bold uppercase tracking-wide">
        {title}
      </h2>
      <ul className="space-y-2.5">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex gap-2 text-[15px] leading-relaxed">
            <span aria-hidden className="select-none text-ink-faint">
              •
            </span>
            <span>
              <RichText text={bullet.text} entities={entities} />
              <SourceRefs refs={bullet.source_refs} sources={sources} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SourceRefs({ refs, sources }: { refs: number[]; sources: Source[] }) {
  const valid = refs.filter((r) => r >= 0 && r < sources.length);
  if (valid.length === 0) return null;
  return (
    <sup className="ml-1 space-x-0.5 text-[10px] font-medium text-ink-faint">
      {valid.map((r) => {
        const source = sources[r]!;
        return (
          <a
            key={r}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            className="hover:text-ink hover:underline"
          >
            [{r + 1}]
          </a>
        );
      })}
    </sup>
  );
}
