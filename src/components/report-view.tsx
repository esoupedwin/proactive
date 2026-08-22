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
  TrendingItem,
  TrendingMomentum,
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

/**
 * The report's hero image with its credit resolved from the cited source.
 * Renders nothing when the reporter chose no image.
 */
function ReportHero({
  sections,
  sources,
}: {
  sections: ReportSections;
  sources: Source[];
}) {
  const hero = sections.hero_image;
  if (!hero) return null;
  const source =
    hero.source_ref >= 0 && hero.source_ref < sources.length
      ? sources[hero.source_ref]!
      : null;
  return (
    <HeroImage
      url={hero.url}
      alt={hero.alt}
      description={
        hero.description ?? (source ? `From “${source.title}”` : null)
      }
      credit={source ? (source.publisher ?? source.title) : null}
      creditUrl={source?.url ?? null}
    />
  );
}

/** The briefing's bullet style: a dot, rich text, and superscript citations. */
function Bullets({
  bullets,
  sources,
  entities,
  className = "space-y-2.5",
}: {
  bullets: ReportBullet[];
  sources: Source[];
  entities: string[];
  className?: string;
}) {
  return (
    <ul className={className}>
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
  // Trending-mode reports render as an attention map.
  if (sections.trending) {
    return (
      <TrendingReportView
        sections={sections}
        items={sections.trending}
        sources={sources}
        entities={entities}
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

  const takeaways = takeawayPoints(sections.cross_source_takeaway);

  return (
    <div className="space-y-7">
      <ReportHero sections={sections} sources={sources} />
      {takeaways.length > 0 && (
        <section aria-label="Overall Takeaway">
          <h2 className="mb-2 border-b border-rule pb-1 text-sm font-bold uppercase tracking-wide">
            Overall Takeaway
          </h2>
          <Bullets
            bullets={takeaways.map((text) => ({ text, source_refs: [] }))}
            sources={sources}
            entities={entities}
          />
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

const MOMENTUM_LABEL: Record<TrendingMomentum, string> = {
  new: "New",
  rising: "Rising",
  steady: "Steady",
  fading: "Fading",
};

const MOMENTUM_CLASS: Record<TrendingMomentum, string> = {
  new: "border-sky-300 bg-sky-50 text-sky-900",
  rising: "border-emerald-300 bg-emerald-50 text-emerald-900",
  steady: "border-rule text-ink-soft",
  fading: "border-amber-300 bg-amber-50 text-amber-900",
};

/** Trending-mode layout: what's gaining attention, one card per subject. */
function TrendingReportView({
  sections,
  items,
  sources,
  entities,
}: {
  sections: ReportSections;
  items: TrendingItem[];
  sources: Source[];
  entities: string[];
}) {
  return (
    <div className="space-y-7">
      {sections.no_meaningful_change && (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-ink-soft">
          Attention hasn&apos;t shifted meaningfully since the previous update.
        </p>
      )}

      {!sections.no_meaningful_change && (
        <ReportHero sections={sections} sources={sources} />
      )}

      {items.map((item, index) => (
        <section
          key={index}
          aria-label={item.subject}
          className="rounded-md border border-rule px-4 py-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold tracking-tight">
              <RichText text={item.subject} entities={entities} />
            </h2>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${MOMENTUM_CLASS[item.momentum]}`}
            >
              {MOMENTUM_LABEL[item.momentum]}
            </span>
          </div>
          {item.mood && (
            <p className="mt-1 text-sm text-ink-soft">
              Mood: <RichText text={item.mood} entities={entities} />
            </p>
          )}
          {item.bullets.length > 0 && (
            <Bullets
              bullets={item.bullets}
              sources={sources}
              entities={entities}
              className="mt-3 space-y-2.5"
            />
          )}
          {item.talking_point && (
            <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm leading-relaxed text-ink-soft">
              <span className="font-semibold">Say this:</span>{" "}
              <RichText text={item.talking_point} entities={entities} />
            </p>
          )}
        </section>
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
  const assessed = (sections.factor_assessments ?? []).filter(
    (fa) => fa.bullets.length > 0,
  );

  return (
    <div className="space-y-7">
      {sections.no_meaningful_change && (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-ink-soft">
          Nothing new bears on this question since the previous update — the
          assessment below stands.
        </p>
      )}

      {!sections.no_meaningful_change && (
        <ReportHero sections={sections} sources={sources} />
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
          <Bullets
            bullets={verdict.rationale}
            sources={sources}
            entities={entities}
            className="mt-4 space-y-2.5"
          />
        )}
      </section>

      {/* Factors that produced no evidence render nothing, so count the ones
          that will actually appear before heading the group. */}
      {assessed.length > 0 && (
        <section aria-label="Key factors">
          {/* Larger and mixed-case, so it reads as the group label above the
              uppercase factor headings rather than as another peer section. */}
          <h2 className="mb-4 text-base font-bold tracking-tight">
            {assessed.length === 1 ? "Key Factor" : "Key Factors"}
          </h2>
          <div className="space-y-7">
            {assessed.map((fa) => (
              <Section
                key={fa.factor}
                title={fa.factor}
                bullets={fa.bullets}
                sources={sources}
                entities={entities}
              />
            ))}
          </div>
        </section>
      )}

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
      <Bullets bullets={bullets} sources={sources} entities={entities} />
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
