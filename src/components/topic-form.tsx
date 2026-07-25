"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { TopicFormState } from "@/lib/actions";
import type { Topic } from "@/lib/types";
import { Button, Field, Input, Select, Spinner, Textarea } from "./ui";

const EMPTY_STATE: TopicFormState = {};

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
          htmlFor="interest_areas"
          error={state.fieldErrors?.interest_areas}
          hint="One per line."
        >
          <Textarea
            id="interest_areas"
            name="interest_areas"
            rows={5}
            defaultValue={topic?.interest_areas.join("\n")}
            placeholder={"Top models for reasoning\nTop models for coding\nEfficiency and cost"}
            required
          />
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
