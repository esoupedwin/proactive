import type { ReportBullet, ReportSections, Source } from "@/lib/types";
import { HeroImage } from "./hero-image";

/** Renders one structured report in the editorial briefing style. */
export function ReportView({
  sections,
  sources,
}: {
  sections: ReportSections;
  sources: Source[];
}) {
  if (sections.no_meaningful_change) {
    return (
      <div className="space-y-6">
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-ink-soft">
          Nothing significant has changed for this topic since the previous
          update.
        </p>
        <Section title="What Changed" bullets={sections.what_changed} sources={sources} />
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
            {sections.cross_source_takeaway}
          </p>
        </section>
      )}
      <Section
        title="Latest Developments"
        bullets={sections.latest_developments}
        sources={sources}
      />
      <Section
        title="Community Reaction — Reddit"
        bullets={sections.community_reaction}
        sources={sources}
      />
      <Section
        title="What Practitioners Are Writing — Medium"
        bullets={sections.practitioner_view}
        sources={sources}
      />
      <Section
        title="What Changed"
        bullets={sections.what_changed}
        sources={sources}
      />
    </div>
  );
}

function Section({
  title,
  bullets,
  sources,
}: {
  title: string;
  bullets: ReportBullet[];
  sources: Source[];
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
              {bullet.text}
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
