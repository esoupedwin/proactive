"use client";

import Link from "next/link";
import { useState } from "react";
import { EXPERT_KINDS, ExpertIcon } from "@/lib/expert-kinds";
import type { ExpertKind, PersonalityMode } from "@/lib/types";
import { MarkdownTextarea } from "./markdown-textarea";
import { SubmitButton } from "./submit-button";
import { Field, Input, Select } from "./ui";

type ExpertKindChoice = ExpertKind;

/**
 * Two-step add-expert flow: pick the expert type, then fill in its details.
 * The server page binds the add actions to the topic and passes them down.
 */
export function NewExpertForm({
  topicId,
  mentorExists,
  sentimentExists,
  addMentor,
  addAnalyst,
  addSentiment,
  addPersonality,
}: {
  topicId: string;
  /** Mentor is one-per-topic; an existing one disables the choice. */
  mentorExists: boolean;
  /** Sentiment is one-per-topic too — it has no differentiating config. */
  sentimentExists: boolean;
  addMentor: (formData: FormData) => Promise<void>;
  addAnalyst: (formData: FormData) => Promise<void>;
  addSentiment: () => Promise<void>;
  addPersonality: (formData: FormData) => Promise<void>;
}) {
  const [kind, setKind] = useState<ExpertKindChoice | null>(null);
  const [personalityMode, setPersonalityMode] =
    useState<PersonalityMode>("stance");

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">
          What kind of expert?
        </legend>
        <div className="grid auto-rows-fr grid-cols-2 gap-4" role="radiogroup">
          <TypeCard
            kind="mentor"
            selected={kind === "mentor"}
            disabled={mentorExists}
            onSelect={() => setKind("mentor")}
            description={
              mentorExists
                ? "Already on this topic — one Mentor per topic."
                : "“Did you know” tips that build your understanding of this topic over time."
            }
          />
          <TypeCard
            kind="analyst"
            selected={kind === "analyst"}
            onSelect={() => setKind("analyst")}
            description="An independent commentator that reads each report through a specialization you choose."
          />
          <TypeCard
            kind="sentiment"
            selected={kind === "sentiment"}
            disabled={sentimentExists}
            onSelect={() => setKind("sentiment")}
            description={
              sentimentExists
                ? "Already on this topic — one Sentiment reader per topic."
                : "Searches Reddit for public reaction to each report's main points and reads the mood."
            }
          />
          <TypeCard
            kind="personality"
            selected={kind === "personality"}
            onSelect={() => setKind("personality")}
            description="Studies the people behind the topic — tracks key players' stances on an issue, or profiles who's mentioned in each report."
          />
        </div>
      </fieldset>

      {kind === "mentor" && (
        <form action={addMentor} className="space-y-3 border-t border-rule pt-5">
          <Field
            label="Teaching level"
            htmlFor="level"
            hint="You can change this anytime."
          >
            <Select id="level" name="level" defaultValue="basic">
              <option value="basic">Basic — explain like I&apos;m new to this</option>
              <option value="intermediate">
                Intermediate — I have working knowledge
              </option>
              <option value="advanced">Advanced — only non-obvious context</option>
            </Select>
          </Field>
          <Field
            label="Teaching focus"
            htmlFor="teaching_focus"
            hint="“People & organisations” highlights relationships between mentioned entities and fact-checks them with a web search."
          >
            <Select id="teaching_focus" name="teaching_focus" defaultValue="concepts">
              <option value="concepts">Key concepts and background</option>
              <option value="entities">
                People &amp; organisations — who they are and how they relate
              </option>
            </Select>
          </Field>
          <SubmitButton pendingLabel="Adding Mentor…">Add Mentor</SubmitButton>
        </form>
      )}

      {kind === "analyst" && (
        <form action={addAnalyst} className="space-y-3 border-t border-rule pt-5">
          <Field
            label="Name"
            htmlFor="add_analyst_name"
            hint="Optional — defaults to “Analyst”. With several analysts, distinct names keep their sections apart."
          >
            <Input
              id="add_analyst_name"
              name="name"
              maxLength={60}
              placeholder="e.g. Prof. James Chin"
            />
          </Field>
          <Field
            label="Specialization"
            htmlFor="analyst_focus"
            hint="Optional — defaults to the topic itself. Markdown works, and you can change this anytime."
          >
            <MarkdownTextarea
              id="analyst_focus"
              name="focus"
              maxLength={4000}
              rows={4}
              placeholder="e.g. Malaysia's domestic politics, governance, power dynamics, and society"
            />
          </Field>
          <SubmitButton pendingLabel="Adding Analyst…">Add Analyst</SubmitButton>
        </form>
      )}

      {kind === "personality" && (
        <form
          action={addPersonality}
          className="space-y-3 border-t border-rule pt-5"
        >
          <Field
            label="Name"
            htmlFor="add_personality_name"
            hint="Optional — defaults to “Personality”. With several, distinct names keep their sections apart."
          >
            <Input
              id="add_personality_name"
              name="name"
              maxLength={60}
              placeholder="e.g. Key Players"
            />
          </Field>
          <Field
            label="Objective"
            htmlFor="personality_mode"
            hint="Fixed once added — add a second Personality expert for the other objective."
          >
            <Select
              id="personality_mode"
              name="personality_mode"
              value={personalityMode}
              onChange={(e) =>
                setPersonalityMode(e.target.value as PersonalityMode)
              }
            >
              <option value="stance">
                Track key players&apos; stances on an issue over time
              </option>
              <option value="profiles">
                Understand the people mentioned in each report
              </option>
            </Select>
          </Field>
          {personalityMode === "stance" && (
            <Field
              label="Issue to track"
              htmlFor="personality_issue"
              hint="Optional — defaults to the topic's own question. On its first run this expert scans the web for the key players and stores a baseline of their stances; later runs track how each stance moves."
            >
              <MarkdownTextarea
                id="personality_issue"
                name="issue"
                maxLength={1000}
                rows={3}
                placeholder="e.g. Will UMNO leave the Unity Government?"
              />
            </Field>
          )}
          <SubmitButton pendingLabel="Adding Personality…">
            Add Personality
          </SubmitButton>
        </form>
      )}

      {kind === "sentiment" && (
        <form action={addSentiment} className="space-y-3 border-t border-rule pt-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            Nothing to configure — after each report, the Sentiment reader
            searches Reddit for reaction to its main points and adds a short
            reading of the public mood below the briefing. Each run uses web
            searches, shown in the run&apos;s cost line.
          </p>
          <SubmitButton pendingLabel="Adding Sentiment reader…">
            Add Sentiment reader
          </SubmitButton>
        </form>
      )}

      <div className="border-t border-rule pt-5">
        <Link
          href={`/topics/${topicId}/experts`}
          className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-ink-soft hover:bg-neutral-100"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}

function TypeCard({
  kind,
  selected,
  disabled,
  onSelect,
  description,
}: {
  kind: ExpertKindChoice;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex h-full flex-col items-start rounded-lg border p-4 text-left transition-colors disabled:opacity-50 ${
        selected
          ? "border-ink bg-neutral-50"
          : "border-rule hover:bg-neutral-50"
      }`}
    >
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full border border-rule bg-neutral-50"
      >
        <ExpertIcon kind={kind} />
      </span>
      <span className="mt-3 text-base font-bold">
        {EXPERT_KINDS[kind].title}
      </span>
      <span className="mt-1 text-xs leading-relaxed text-ink-faint">
        {description}
      </span>
    </button>
  );
}
