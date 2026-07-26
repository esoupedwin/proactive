import { Fragment } from "react";
import {
  hasEntityMarkers,
  highlightEntities,
  parseMarkedText,
} from "@/lib/entities";
import type { ReportBullet, ReportSections, Source } from "@/lib/types";
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
}: {
  sections: ReportSections;
  sources: Source[];
  /** Key entities from topic memory, used only when the report has no inline markers. */
  fallbackEntities?: string[];
}) {
  // If the reporter marked entities itself, trust its judgment everywhere.
  const entities = hasEntityMarkers(sections) ? [] : fallbackEntities;
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
      {sections.cross_source_takeaway && (
        <section aria-label="Overall Takeaway">
          <h2 className="mb-2 border-b border-rule pb-1 text-sm font-bold uppercase tracking-wide">
            Overall Takeaway
          </h2>
          <p className="text-[15px] leading-relaxed text-ink">
            <RichText text={sections.cross_source_takeaway} entities={entities} />
          </p>
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
