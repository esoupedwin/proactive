"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bot, Check, Landmark, RotateCcw } from "lucide-react";
import { mentorTipFeedback } from "@/lib/actions";
import { formatTokens, formatUsdDetailed } from "@/lib/reports";
import type {
  AnalystAnalysis,
  Expert,
  ExpertOutput,
  MentorTip,
  ScenarioLikelihood,
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

function ExpertCard({
  expert,
  output,
  reportId,
}: {
  expert: Expert;
  output: ExpertOutput | null;
  reportId: string;
}) {
  const isAnalyst = expert.kind === "analyst";
  return (
    <div className="rounded-md border border-rule">
      <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
        >
          {isAnalyst ? <Landmark className="size-5" /> : <Bot className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">{expert.name}</p>
          <p className="truncate text-xs text-ink-faint">
            {isAnalyst
              ? (expert.config.focus ?? "Neutral, evidence-based analysis")
              : `${
                  expert.config.teaching_focus === "entities"
                    ? "Explains the people, organisations & their ties"
                    : "Helps you understand key concepts"
                } · ${expert.config.level ?? "basic"} level`}
          </p>
        </div>
      </div>

      {output ? (
        isAnalyst ? (
          output.output.analysis ? (
            <AnalystBody analysis={output.output.analysis} />
          ) : (
            <p className="px-4 py-4 text-sm text-ink-faint">
              No analysis recorded for this report.
            </p>
          )
        ) : (
          <ul className="divide-y divide-rule">
            {(output.output.tips ?? []).map((tip) => (
              <TipCard
                key={tip.id}
                tip={tip}
                expertId={expert.id}
                outputId={output.id}
              />
            ))}
            {(output.output.tips ?? []).length === 0 && (
              <li className="px-4 py-4 text-sm text-ink-faint">
                Nothing new to explain in this report — you know this ground
                already.
              </li>
            )}
          </ul>
        )
      ) : (
        <RunExpertPrompt expert={expert} reportId={reportId} />
      )}

      {output?.output.usage && output.output.usage.calls > 0 && (
        <p className="border-t border-rule px-4 py-2 text-[11px] text-ink-faint">
          This run:{" "}
          {formatTokens(
            output.output.usage.input_tokens + output.output.usage.output_tokens,
          )}{" "}
          tokens
          {output.output.usage.web_search_calls > 0 &&
            ` · ${output.output.usage.web_search_calls} web search${
              output.output.usage.web_search_calls === 1 ? "" : "es"
            }`}
          {" · "}
          {formatUsdDetailed(output.output.usage.estimated_cost_usd)}
        </p>
      )}
    </div>
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
  reportId,
}: {
  expert: Expert;
  reportId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function run() {
    setState("loading");
    try {
      const res = await fetch(`/api/experts/${expert.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div className="px-4 py-4">
      <button
        type="button"
        onClick={run}
        disabled={state === "loading"}
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-rule px-3 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
      >
        {state === "loading" ? (
          <>
            <Spinner /> {expert.name} is reading the report…
          </>
        ) : (
          <>Ask {expert.name} to review this report</>
        )}
      </button>
      {state === "error" && (
        <p className="mt-2 text-xs text-red-700">
          {expert.name} could not review this report. Try again.
        </p>
      )}
    </div>
  );
}
