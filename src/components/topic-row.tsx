"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { deleteTopic, toggleTopicStatus } from "@/lib/actions";
import type { Topic } from "@/lib/types";
import { LinkPending } from "./link-pending";
import { Badge, Spinner } from "./ui";

/** One row in the Manage List: actions + expandable configuration details. */
export function TopicRow({ topic }: { topic: Topic }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function onToggleStatus() {
    startTransition(() => toggleTopicStatus(topic.id));
  }

  function onDelete() {
    if (
      window.confirm(
        `Delete "${topic.title}" and all of its reports? This cannot be undone.`,
      )
    ) {
      startTransition(() => deleteTopic(topic.id));
    }
  }

  const iconButton =
    "rounded-md p-2.5 text-ink-soft hover:bg-neutral-100 hover:text-ink";

  return (
    <li className="border-b border-rule">
      <div className="flex items-center gap-1 py-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${topic.title}`}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        >
          <span className="min-w-0 truncate text-sm font-semibold">
            {topic.title}
          </span>
          {topic.status === "paused" && <Badge tone="paused">paused</Badge>}
          {expanded ? (
            <ChevronUp className="size-4 shrink-0 text-ink-faint" aria-hidden />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-ink-faint" aria-hidden />
          )}
        </button>

        {pending ? (
          <Spinner className="mx-2 text-ink-faint" />
        ) : (
          <div className="flex shrink-0 items-center">
            <Link
              href={`/topics/${topic.id}`}
              aria-label={`View ${topic.title}`}
              className={iconButton}
            >
              <LinkPending>
                <Eye className="size-4" aria-hidden />
              </LinkPending>
            </Link>
            <Link
              href={`/topics/${topic.id}/edit`}
              aria-label={`Edit ${topic.title}`}
              className={iconButton}
            >
              <LinkPending>
                <Pencil className="size-4" aria-hidden />
              </LinkPending>
            </Link>
            <button
              onClick={onToggleStatus}
              aria-label={
                topic.status === "active"
                  ? `Pause ${topic.title}`
                  : `Resume ${topic.title}`
              }
              className={iconButton}
            >
              {topic.status === "active" ? (
                <Pause className="size-4" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
            </button>
            <button
              onClick={onDelete}
              aria-label={`Delete ${topic.title}`}
              className="rounded-md p-2.5 text-ink-soft hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mb-3 rounded-md border border-rule bg-neutral-50 px-4 py-3 text-sm">
          <p className="font-semibold">I want to know:</p>
          <p className="mt-1 leading-relaxed text-ink-soft">
            {topic.description || "—"}
          </p>
          {topic.interest_areas.length > 0 && (
            <>
              <p className="mt-3 font-semibold">Key interest areas:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-ink-soft">
                {topic.interest_areas.map((area) => (
                  <li key={area}>{area}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-xs text-ink-faint">
            Detail: {topic.detail_level} · Frequency: {topic.frequency} ·{" "}
            {topic.status === "active" ? "Monitoring" : "Paused"}
          </p>
        </div>
      )}
    </li>
  );
}
