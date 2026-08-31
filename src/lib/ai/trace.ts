import type { AgentRunNote, LlmCallTrace, ReportTrace } from "../types";

/**
 * Records the sequence of LLM calls made during one report generation so the
 * user can inspect exactly what was asked of the model and in what order.
 */

// Keep stored traces bounded — inputs embed source dumps and can get large.
const MAX_TEXT_CHARS = 20_000;

function clip(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n… [truncated ${text.length - MAX_TEXT_CHARS} characters]`;
}

export interface TraceCollector {
  record(call: Omit<LlmCallTrace, "index">): void;
  /** Records an agent run that ended early — see `AgentRunNote`. */
  note(note: Omit<AgentRunNote, "at">): void;
  snapshot(): ReportTrace;
}

export function createTraceCollector(): TraceCollector {
  const calls: LlmCallTrace[] = [];
  const notes: AgentRunNote[] = [];

  return {
    record(call) {
      calls.push({
        ...call,
        index: calls.length + 1,
        instructions: clip(call.instructions),
        input: clip(call.input),
      });
    },
    note(note) {
      notes.push({ ...note, at: new Date().toISOString() });
    },
    snapshot() {
      // Omitted when empty, so a clean run's trace keeps its previous shape.
      return notes.length > 0
        ? { calls: [...calls], notes: [...notes] }
        : { calls: [...calls] };
    },
  };
}
