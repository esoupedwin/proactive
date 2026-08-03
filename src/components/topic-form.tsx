"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { draftInterestFrame, type TopicFormState } from "@/lib/actions";
import { formatDateTime, nextScheduledRun } from "@/lib/reports";
import type {
  InterestFactor,
  Topic,
  TopicStatus,
  UpdateFrequency,
  WatchMode,
} from "@/lib/types";
import { Button, Field, Input, Select, Spinner, Textarea } from "./ui";

const EMPTY_STATE: TopicFormState = {};

const MAX_FACTORS = 10;

/** A factor as edited in the form — indicators as one comma-separated text. */
interface FactorDraft {
  name: string;
  key_question: string;
  indicators: string;
}

const EMPTY_FACTOR: FactorDraft = { name: "", key_question: "", indicators: "" };

const FACTOR_PLACEHOLDERS = [
  "e.g. Political Incentives",
  "e.g. Internal Party Dynamics",
  "e.g. Elite Relationships",
  "e.g. Coalition Arithmetic",
  "e.g. Trigger Events",
];

function toDraft(factor: InterestFactor): FactorDraft {
  return {
    name: factor.name,
    key_question: factor.key_question,
    indicators: factor.indicators.join(", "),
  };
}

function toFactor(draft: FactorDraft): InterestFactor {
  return {
    name: draft.name.trim(),
    key_question: draft.key_question.trim(),
    indicators: draft.indicators
      .split(/[,;]/)
      .map((i) => i.trim())
      .filter(Boolean),
  };
}

/** Shared add/edit topic form backed by a server action. */
export function TopicForm({
  action,
  topic,
  heading,
  submitLabel,
}: {
  action: (prev: TopicFormState, formData: FormData) => Promise<TopicFormState>;
  topic?: Topic;
  heading: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_STATE);
  const [factors, setFactors] = useState<FactorDraft[]>(() =>
    topic?.interest_frame.length
      ? topic.interest_frame.map(toDraft)
      : [{ ...EMPTY_FACTOR }],
  );
  const [watchMode, setWatchMode] = useState<WatchMode>(
    topic?.watch_mode ?? "monitor",
  );
  const [frequency, setFrequency] = useState<UpdateFrequency>(
    topic?.frequency ?? "daily",
  );
  const [status, setStatus] = useState<TopicStatus>(topic?.status ?? "active");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const nextRun = nextScheduledRun(
    frequency,
    status,
    topic?.last_generated_at ?? null,
  );
  const nextRunHint = nextRun
    ? `Next automatic update: ${formatDateTime(nextRun.toISOString())}.`
    : status === "paused"
      ? "Paused — no automatic updates."
      : "No automatic updates — generate manually.";

  // The server action reads the frame from this single hidden JSON field.
  const frameJson = JSON.stringify(
    factors.map(toFactor).filter((f) => f.name !== ""),
  );

  function updateFactor(index: number, patch: Partial<FactorDraft>) {
    setFactors((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  }

  function removeFactor(index: number) {
    setFactors((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ ...EMPTY_FACTOR }],
    );
  }

  function addFactor() {
    setFactors((prev) =>
      prev.length < MAX_FACTORS ? [...prev, { ...EMPTY_FACTOR }] : prev,
    );
  }

  async function suggestFrame(form: HTMLFormElement | null) {
    if (!form || drafting) return;
    const data = new FormData(form);
    setDrafting(true);
    setDraftError(null);
    try {
      const result = await draftInterestFrame({
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? ""),
        analytical_question: String(data.get("analytical_question") ?? ""),
      });
      if (result.factors?.length) {
        setFactors(result.factors.map(toDraft));
      } else {
        setDraftError(result.error ?? "No suggestions — try adding detail.");
      }
    } finally {
      setDrafting(false);
    }
  }

  return (
    <main className="px-5 pb-16 pt-6">
      <header className="mb-6 border-b border-rule pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
      </header>

      <form action={formAction} className="space-y-5" noValidate>
        <Field
          label="Topic title"
          htmlFor="title"
          error={state.fieldErrors?.title}
          info="A short name for this topic. Shown in navigation, lists, and at the top of every report."
        >
          <Input
            id="title"
            name="title"
            defaultValue={topic?.title}
            placeholder="e.g. Latest top LLMs"
            required
            maxLength={120}
          />
        </Field>

        <Field
          label="What do you want to understand?"
          htmlFor="description"
          error={state.fieldErrors?.description}
          hint="Written as a goal — Proactive uses this to decide what matters."
          info="Your research goal in your own words. The AI reads this to plan its searches and to judge which findings are worth reporting."
        >
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={topic?.description}
            placeholder="e.g. I want to understand where the frontier LLM landscape is heading and what the emerging consensus is across different information sources."
            required
          />
        </Field>

        <Field
          label="How should Proactive watch this?"
          htmlFor="watch_mode"
          info="Monitor keeps you up to date with a classic briefing. Answer a question makes every report an assessment: findings are weighed against the interest frame to answer your analytical question."
        >
          <Select
            id="watch_mode"
            name="watch_mode"
            value={watchMode}
            onChange={(e) => setWatchMode(e.target.value as WatchMode)}
          >
            <option value="monitor">Monitor developments</option>
            <option value="question">Answer a question</option>
          </Select>
        </Field>

        {watchMode === "question" && (
          <Field
            label="Analytical question"
            htmlFor="analytical_question"
            error={state.fieldErrors?.analytical_question}
            hint="A yes/no or outcome question the reports should keep answering."
            info="Each report assesses the consolidated findings against the interest frame and gives a current answer to this question, with a verdict that is tracked over time."
          >
            <Input
              id="analytical_question"
              name="analytical_question"
              defaultValue={topic?.analytical_question ?? ""}
              placeholder="e.g. Will UMNO leave the Unity Government (UG)?"
              maxLength={300}
            />
          </Field>
        )}

        <Field
          label="Interest frame"
          htmlFor="factor_name_0"
          error={state.fieldErrors?.interest_frame}
          hint={`The factors that drive this topic, up to ${MAX_FACTORS}. Key question and indicators are optional but sharpen the search.`}
          info="The analytical frame for this topic. Each factor names an angle to track; its key question says what the factor should answer, and its indicators are the observable evidence to watch. The tracker searches along these factors and tags findings with them."
        >
          <div className="space-y-3">
            {factors.map((factor, index) => (
              <div
                key={index}
                className="space-y-2 rounded-md border border-rule bg-neutral-50 p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    id={`factor_name_${index}`}
                    value={factor.name}
                    onChange={(e) =>
                      updateFactor(index, { name: e.target.value })
                    }
                    placeholder={
                      FACTOR_PLACEHOLDERS[index] ?? "Another factor to track"
                    }
                    aria-label={`Factor ${index + 1} name`}
                    className="font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => removeFactor(index)}
                    disabled={factors.length === 1 && factor.name === ""}
                    aria-label={`Remove factor ${index + 1}`}
                    className="shrink-0 rounded-md p-2.5 text-ink-faint hover:bg-neutral-100 hover:text-ink disabled:opacity-40"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <Input
                  value={factor.key_question}
                  onChange={(e) =>
                    updateFactor(index, { key_question: e.target.value })
                  }
                  placeholder="Key question — e.g. Does UMNO gain more by staying or leaving?"
                  aria-label={`Factor ${index + 1} key question`}
                />
                <Input
                  value={factor.indicators}
                  onChange={(e) =>
                    updateFactor(index, { indicators: e.target.value })
                  }
                  placeholder="Indicators, comma-separated — e.g. polling trends, by-election performance"
                  aria-label={`Factor ${index + 1} indicators`}
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addFactor}
                  disabled={factors.length >= MAX_FACTORS}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-rule px-3 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40"
                >
                  <Plus className="size-4" aria-hidden /> Add factor
                </button>
                <button
                  type="button"
                  onClick={(e) => suggestFrame(e.currentTarget.form)}
                  disabled={drafting}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-rule px-3 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40"
                >
                  {drafting ? (
                    <Spinner />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  Suggest frame
                </button>
              </div>
              <span
                className={
                  factors.length >= MAX_FACTORS
                    ? "text-xs font-medium text-amber-800"
                    : "text-xs text-ink-faint"
                }
              >
                {factors.length >= MAX_FACTORS
                  ? `Maximum of ${MAX_FACTORS} factors reached`
                  : `${factors.length} of ${MAX_FACTORS} factors`}
              </span>
            </div>
            {draftError && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {draftError}
              </p>
            )}
          </div>
        </Field>

        <input type="hidden" name="interest_frame" value={frameJson} />

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Detail level"
            htmlFor="detail_level"
            info="How long each report is: Brief ≈ 3 bullets per section, Standard 3–5, Deep up to 7."
          >
            <Select
              id="detail_level"
              name="detail_level"
              defaultValue={topic?.detail_level ?? "standard"}
            >
              <option value="brief">Brief</option>
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
            </Select>
          </Field>

          <Field
            label="Update frequency"
            htmlFor="frequency"
            info="How often Proactive generates a report automatically via its daily scheduler. This also sets the source freshness window: Daily uses sources from the last 1 day, Every 3 days from the last 3, Weekly and Manual from the last 7. Manual topics only update when you press Generate Update."
          >
            <Select
              id="frequency"
              name="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as UpdateFrequency)}
            >
              <option value="daily">Daily</option>
              <option value="every_3_days">Every 3 days</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual only</option>
            </Select>
          </Field>
        </div>

        <p className="text-xs text-ink-faint" role="status">
          {nextRunHint}
        </p>

        <Field
          label="Monitoring"
          htmlFor="status"
          info="The on/off switch for automatic updates. Paused topics keep all their reports and history but are skipped by the scheduler."
        >
          <Select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TopicStatus)}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </Select>
        </Field>

        {state.error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-rule pt-5">
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            {submitLabel}
          </Button>
          <Link
            href={topic ? `/topics/${topic.id}` : "/settings"}
            className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-ink-soft hover:bg-neutral-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
