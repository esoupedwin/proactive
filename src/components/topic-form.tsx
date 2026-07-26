"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import type { TopicFormState } from "@/lib/actions";
import type { Topic } from "@/lib/types";
import { Button, Field, Input, Select, Spinner, Textarea } from "./ui";

const EMPTY_STATE: TopicFormState = {};

const MAX_INTEREST_AREAS = 10;

const AREA_PLACEHOLDERS = [
  "e.g. Top models for reasoning",
  "e.g. Top models for coding",
  "e.g. Efficiency and cost",
  "e.g. Agentic capabilities",
  "e.g. Rumors about upcoming models",
];

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
  const [areas, setAreas] = useState<string[]>(() =>
    topic?.interest_areas.length ? topic.interest_areas : [""],
  );

  function updateArea(index: number, value: string) {
    setAreas((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  function removeArea(index: number) {
    setAreas((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : [""],
    );
  }

  function addArea() {
    setAreas((prev) =>
      prev.length < MAX_INTEREST_AREAS ? [...prev, ""] : prev,
    );
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
          label="Key interest areas"
          htmlFor="interest_areas_0"
          error={state.fieldErrors?.interest_areas}
          hint={`One specific angle per item, up to ${MAX_INTEREST_AREAS} items.`}
        >
          <div className="space-y-2">
            {areas.map((area, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  id={`interest_areas_${index}`}
                  name="interest_areas"
                  value={area}
                  onChange={(e) => updateArea(index, e.target.value)}
                  onKeyDown={(e) => {
                    // Enter adds the next item instead of submitting the form.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addArea();
                    }
                  }}
                  placeholder={
                    AREA_PLACEHOLDERS[index] ?? "Another angle to track"
                  }
                  aria-label={`Interest area ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeArea(index)}
                  disabled={areas.length === 1 && area === ""}
                  aria-label={`Remove interest area ${index + 1}`}
                  className="shrink-0 rounded-md p-2.5 text-ink-faint hover:bg-neutral-100 hover:text-ink disabled:opacity-40"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={addArea}
                disabled={areas.length >= MAX_INTEREST_AREAS}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-rule px-3 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden /> Add item
              </button>
              <span
                className={
                  areas.length >= MAX_INTEREST_AREAS
                    ? "text-xs font-medium text-amber-800"
                    : "text-xs text-ink-faint"
                }
              >
                {areas.length >= MAX_INTEREST_AREAS
                  ? `Maximum of ${MAX_INTEREST_AREAS} items reached`
                  : `${areas.length} of ${MAX_INTEREST_AREAS} items`}
              </span>
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Detail level" htmlFor="detail_level">
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

          <Field label="Update frequency" htmlFor="frequency">
            <Select
              id="frequency"
              name="frequency"
              defaultValue={topic?.frequency ?? "daily"}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual only</option>
            </Select>
          </Field>
        </div>

        <Field label="Monitoring" htmlFor="status">
          <Select id="status" name="status" defaultValue={topic?.status ?? "active"}>
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
