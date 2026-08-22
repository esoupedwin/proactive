"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ExternalLink, RefreshCw, RotateCcw, Users } from "lucide-react";
import { mentorTipFeedback } from "@/lib/actions";
import { ExpertIcon } from "@/lib/expert-kinds";
import { linkBadgeLabel, splitMarkdownLinks } from "@/lib/md-links";
import { formatTokens, formatUsdDetailed } from "@/lib/reports";
import {
  isAnalystCommentary,
  type AnalystAnalysis,
  type Expert,
  type ExpertOutput,
  type LegacyAnalystAnalysis,
  type MentorTip,
  type PersonalityOutput,
  type PersonalityProfile,
  type PersonalityStance,
  type ReportUsage,
  type ScenarioLikelihood,
  type StanceTrend,
} from "@/lib/types";
import { Badge, Spinner } from "./ui";

export interface ExpertPanelItem {
  expert: Expert;
  output: ExpertOutput | null;
}

/** Experts' output rendered at the bottom of a report. */
export function ExpertPanel({
  items,
  reportId,
}: {
  items: ExpertPanelItem[];
  reportId: string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Experts" className="mt-8 space-y-4 border-t border-rule pt-6">
      {items.map(({ expert, output }) => (
        <ExpertCard
          key={expert.id}
          expert={expert}
          output={output}
          reportId={reportId}
        />
      ))}
    </section>
  );
}

/**
 * Runs — or re-runs — one expert against one report. The route upserts on
 * (expert, report), so a re-run replaces that expert's section in place.
 */
function useExpertRun(expertId: string, reportId: string) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  // router.refresh() resolves after the server re-renders; keeping it in a
  // transition holds the busy state until the new output is actually on screen.
  const [isRefreshing, startTransition] = useTransition();

  async function run() {
    setState("loading");
    try {
      const res = await fetch(`/api/experts/${expertId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      if (res.ok) {
        setState("idle");
        startTransition(() => router.refresh());
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  return { run, busy: state === "loading" || isRefreshing, failed: state === "error" };
}

/** The expert's configured remit, under its name in the panel header. */
function expertSubtitle(expert: Expert): string {
  switch (expert.kind) {
    case "analyst":
      return expert.config.focus ?? "Neutral, evidence-based analysis";
    case "sentiment":
      return "What Reddit makes of this report's main points";
    case "personality":
      if (expert.config.personality_mode === "profiles") {
        return "Who's who in this report";
      }
      return expert.config.issue ?? "Key players' stances, tracked over time";
    case "mentor":
      return `${
        expert.config.teaching_focus === "entities"
          ? "Explains the people, organisations & their ties"
          : "Helps you understand key concepts"
      } · ${expert.config.level ?? "basic"} level`;
  }
}

/**
 * The stored output rendered in this expert's own shape, or a note when the
 * run produced nothing of that shape (an older or failed output).
 */
function ExpertBody({
  expert,
  output,
}: {
  expert: Expert;
  output: ExpertOutput;
}) {
  const empty = (what: string) => (
    <p className="px-4 py-4 text-sm text-ink-faint">
      No {what} recorded for this report.
    </p>
  );

  switch (expert.kind) {
    case "sentiment":
      return output.output.sentiment ? (
        <SentimentBody reading={output.output.sentiment} />
      ) : (
        empty("sentiment reading")
      );
    case "analyst":
      return output.output.analysis ? (
        <AnalystBody analysis={output.output.analysis} />
      ) : (
        empty("analysis")
      );
    case "personality":
      return output.output.personality ? (
        <PersonalityBody personality={output.output.personality} />
      ) : (
        empty("personality reading")
      );
    case "mentor": {
      const tips = output.output.tips ?? [];
      return (
        <ul className="divide-y divide-rule">
          {tips.map((tip) => (
            <TipCard
              key={tip.id}
              tip={tip}
              expertId={expert.id}
              outputId={output.id}
            />
          ))}
          {tips.length === 0 && (
            <li className="px-4 py-4 text-sm text-ink-faint">
              Nothing new to explain in this report — you know this ground
              already.
            </li>
          )}
        </ul>
      );
    }
  }
}

function ExpertCard({
  expert,
  output,
  reportId,
}: {
  expert: Expert;
  output: ExpertOutput | null;
  reportId: string;
}) {
  const { run, busy, failed } = useExpertRun(expert.id, reportId);

  return (
    <div className="rounded-md border border-rule">
      <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
        >
          <ExpertIcon kind={expert.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{expert.name}</p>
          <p className="truncate text-xs text-ink-faint">
            {expertSubtitle(expert)}
          </p>
        </div>
        {output && (
          <button
            type="button"
            onClick={run}
            disabled={busy}
            title={`Run ${expert.name} again on this report`}
            aria-label={`Run ${expert.name} again on this report`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-rule text-ink-faint hover:bg-neutral-100 hover:text-ink disabled:opacity-50"
          >
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      {output && failed && (
        <p className="border-b border-rule px-4 py-2 text-xs text-red-700">
          {expert.name} could not re-run on this report. Try again.
        </p>
      )}

      {output ? (
        <div
          aria-busy={busy}
          className={busy ? "opacity-50 transition-opacity" : undefined}
        >
          <ExpertBody expert={expert} output={output} />
        </div>
      ) : (
        <RunExpertPrompt
          expert={expert}
          run={run}
          busy={busy}
          failed={failed}
        />
      )}

      <RunCostLine usage={output?.output.usage} />
    </div>
  );
}

/** What this expert's run cost, when it was recorded. */
function RunCostLine({ usage }: { usage: ReportUsage | undefined }) {
  if (!usage || usage.calls === 0) return null;
  const searches = usage.web_search_calls;
  return (
    <p className="border-t border-rule px-4 py-2 text-[11px] text-ink-faint">
      This run: {formatTokens(usage.input_tokens + usage.output_tokens)} tokens
      {searches > 0 &&
        ` · ${searches} web search${searches === 1 ? "" : "es"}`}
      {" · "}
      {formatUsdDetailed(usage.estimated_cost_usd)}
    </p>
  );
}

/** Point-form sentiment reading; older stored outputs were one prose blob. */
function SentimentBody({
  reading,
}: {
  reading: { points?: string[]; commentary?: string };
}) {
  if (reading.points?.length) {
    return (
      <ul className="space-y-2.5 px-4 py-4">
        {reading.points.map((point, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span aria-hidden className="select-none text-ink-faint">
              •
            </span>
            <span className="min-w-0">
              <CommentaryWithLinkBadges text={point} inline />
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="px-4 py-4">
      <CommentaryWithLinkBadges text={reading.commentary ?? ""} />
    </div>
  );
}

/**
 * Prose with inline markdown citations rendered as compact clickable badges
 * (e.g. "r/indonesia ↗") instead of raw [label](url) text.
 * Renders inline (span) inside list bullets, as a paragraph otherwise.
 */
function CommentaryWithLinkBadges({
  text,
  inline = false,
}: {
  text: string;
  inline?: boolean;
}) {
  const segments = splitMarkdownLinks(text);
  const Tag = inline ? "span" : "p";
  return (
    <Tag className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <a
            key={i}
            href={segment.url}
            target="_blank"
            rel="noopener noreferrer"
            title={segment.url}
            className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-rule bg-neutral-50 px-2 py-0.5 align-middle text-[11px] font-medium text-ink-soft hover:bg-neutral-100 hover:text-ink"
          >
            {linkBadgeLabel(segment.url, segment.label)}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ),
      )}
    </Tag>
  );
}

const LIKELIHOOD_TONE: Record<
  ScenarioLikelihood,
  "active" | "neutral" | "paused"
> = {
  likely: "active",
  possible: "neutral",
  unlikely: "paused",
};

function AnalystBody({ analysis }: { analysis: AnalystAnalysis }) {
  if (isAnalystCommentary(analysis)) {
    return (
      <div className="px-4 py-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {analysis.commentary}
        </p>
      </div>
    );
  }
  return <LegacyAnalystBody analysis={analysis} />;
}

/** Renders analyses stored before the analyst became a commentator. */
function LegacyAnalystBody({ analysis }: { analysis: LegacyAnalystAnalysis }) {
  return (
    <div className="space-y-4 px-4 py-4 text-sm leading-relaxed">
      <section aria-label="Assessment">
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
          Assessment
        </h3>
        <p>{analysis.assessment}</p>
      </section>

      {analysis.why_it_matters.length > 0 && (
        <section aria-label="Why it matters">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
            Why it matters
          </h3>
          <ul className="space-y-1.5">
            {analysis.why_it_matters.map((point, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="select-none text-ink-faint">
                  •
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.outlook.length > 0 && (
        <section aria-label="Outlook">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
            Outlook
          </h3>
          <ul className="space-y-2.5">
            {analysis.outlook.map((item, i) => (
              <li key={i}>
                <p className="flex flex-wrap items-baseline gap-1.5">
                  <Badge tone={LIKELIHOOD_TONE[item.likelihood]}>
                    {item.likelihood}
                  </Badge>
                  <span>{item.scenario}</span>
                </p>
                {item.watch_for.length > 0 && (
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Watch for: {item.watch_for.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.scenario_updates.length > 0 && (
        <section aria-label="Scenario updates">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
            Prior calls, revisited
          </h3>
          <ul className="space-y-1.5">
            {analysis.scenario_updates.map((update, i) => (
              <li key={i} className="text-xs leading-relaxed">
                <Badge
                  tone={
                    update.status === "strengthened"
                      ? "active"
                      : update.status === "weakened"
                        ? "paused"
                        : "neutral"
                  }
                >
                  {update.status}
                </Badge>{" "}
                <span className="text-ink-soft">{update.scenario}</span> —{" "}
                {update.note}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.caveats && (
        <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
          <span className="font-semibold">Caveats:</span> {analysis.caveats}
        </p>
      )}
    </div>
  );
}

const TREND_LABEL: Record<StanceTrend, string | null> = {
  baseline: null, // the "First look" banner already says it
  new: "new",
  shifted: "shifted",
  unchanged: null, // no badge — stability is the quiet default
};

const TREND_TONE: Record<StanceTrend, "active" | "neutral" | "paused"> = {
  baseline: "neutral",
  new: "active",
  shifted: "active",
  unchanged: "neutral",
};

function PersonalityBody({ personality }: { personality: PersonalityOutput }) {
  if (personality.mode === "profiles") {
    const profiles = personality.profiles ?? [];
    if (profiles.length === 0) {
      return (
        <p className="px-4 py-4 text-sm text-ink-faint">
          No one new to introduce in this report — you know the cast already.
        </p>
      );
    }
    return (
      <ul className="divide-y divide-rule">
        {profiles.map((profile) => (
          <PersonCard key={profile.name} person={profile}>
            <CommentaryWithLinkBadges text={profile.who} />
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              <span className="font-semibold">In this report:</span>{" "}
              <CommentaryWithLinkBadges text={profile.relevance} inline />
            </p>
          </PersonCard>
        ))}
      </ul>
    );
  }

  const stances = personality.stances ?? [];
  return (
    <div>
      {personality.baseline && (
        <p className="border-b border-rule bg-neutral-50 px-4 py-2 text-xs leading-relaxed text-ink-soft">
          First look: a web scan of the key players and where they stand
          today. Future reports track how each stance moves.
        </p>
      )}
      {stances.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-faint">
          No key players identified yet.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {stances.map((stance) => (
            <PersonCard
              key={stance.name}
              person={stance}
              badge={
                TREND_LABEL[stance.trend] && (
                  <Badge tone={TREND_TONE[stance.trend]}>
                    {TREND_LABEL[stance.trend]}
                  </Badge>
                )
              }
            >
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-bold">Why they matter</h4>
                  <CommentaryWithLinkBadges text={stance.why_matters} />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Current stance</h4>
                  <CommentaryWithLinkBadges text={stance.stance} />
                </div>
              </div>
              {stance.change_note && (
                <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  <span className="font-semibold">What changed:</span>{" "}
                  <CommentaryWithLinkBadges text={stance.change_note} inline />
                </p>
              )}
            </PersonCard>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shared person layout: portrait + name header, kind-specific body below. */
function PersonCard({
  person,
  badge,
  children,
}: {
  person: Pick<
    PersonalityStance | PersonalityProfile,
    "name" | "image_url" | "image_page_url"
  >;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <li className="px-4 py-4">
      <div className="mb-2 flex items-center gap-3">
        {person.image_url && !imageFailed ? (
          <a
            href={person.image_page_url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            title={`${person.name} on Wikipedia`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={person.image_url}
              alt={person.name}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-12 rounded-full border border-rule bg-neutral-50 object-cover"
            />
          </a>
        ) : (
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
          >
            <Users className="size-5 text-ink-faint" />
          </span>
        )}
        <p className="min-w-0 flex-1 text-base font-bold">{person.name}</p>
        {badge}
      </div>
      {children}
    </li>
  );
}

function TipCard({
  tip,
  expertId,
  outputId,
}: {
  tip: MentorTip;
  expertId: string;
  outputId: string;
}) {
  const [feedback, setFeedback] = useState<"known" | "remind" | null>(null);
  const [more, setMore] = useState<string | null>(tip.more ?? null);
  const [moreState, setMoreState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [imageFailed, setImageFailed] = useState(false);
  const [, startTransition] = useTransition();

  function giveFeedback(kind: "known" | "remind") {
    setFeedback(kind);
    startTransition(() => mentorTipFeedback(expertId, tip.concept, kind));
  }

  async function shareMore() {
    setMoreState("loading");
    try {
      const res = await fetch(`/api/experts/${expertId}/more`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outputId, tipId: tip.id }),
      });
      const body = (await res.json().catch(() => null)) as
        | { more?: string }
        | null;
      if (res.ok && body?.more) {
        setMore(body.more);
        setMoreState("idle");
      } else {
        setMoreState("error");
      }
    } catch {
      setMoreState("error");
    }
  }

  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          <strong className="font-semibold">{tip.concept}.</strong> {tip.tip}
        </p>
        {tip.image_url && !imageFailed && (
          <a
            href={tip.image_page_url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-center"
            title={`${tip.concept} on Wikipedia`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tip.image_url}
              alt={tip.concept}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-16 rounded-md border border-rule bg-neutral-50 object-contain"
            />
            <span className="mt-0.5 block text-[10px] text-ink-faint">
              Wikipedia
            </span>
          </a>
        )}
      </div>

      {more && (
        <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-sm leading-relaxed text-ink-soft">
          {more}
        </p>
      )}
      {moreState === "error" && (
        <p className="mt-2 text-xs text-red-700">
          Could not load more right now — try again.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {feedback === null ? (
          <>
            <FeedbackButton onClick={() => giveFeedback("known")}>
              I know this
            </FeedbackButton>
            <FeedbackButton onClick={() => giveFeedback("remind")}>
              Remind me again
            </FeedbackButton>
            {!more && (
              <FeedbackButton
                onClick={shareMore}
                disabled={moreState === "loading"}
              >
                {moreState === "loading" ? (
                  <>
                    <Spinner className="size-3" /> Thinking…
                  </>
                ) : (
                  "Share more"
                )}
              </FeedbackButton>
            )}
          </>
        ) : feedback === "known" ? (
          <p className="flex items-center gap-1 text-xs text-emerald-700">
            <Check className="size-3.5" aria-hidden /> Marked as known — Mentor
            won&apos;t explain this again.
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-ink-faint">
            <RotateCcw className="size-3.5" aria-hidden /> Noted — Mentor will
            bring this up again later.
          </p>
        )}
      </div>
    </li>
  );
}

function FeedbackButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-rule px-3 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function RunExpertPrompt({
  expert,
  run,
  busy,
  failed,
}: {
  expert: Expert;
  run: () => void;
  busy: boolean;
  failed: boolean;
}) {
  return (
    <div className="px-4 py-4">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-rule px-3 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
      >
        {busy ? (
          <>
            <Spinner /> {expert.name} is reading the report…
          </>
        ) : (
          <>Ask {expert.name} to review this report</>
        )}
      </button>
      {failed && (
        <p className="mt-2 text-xs text-red-700">
          {expert.name} could not review this report. Try again.
        </p>
      )}
    </div>
  );
}
