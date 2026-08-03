import type { InterestFactor, Topic } from "../types";

/** Renders the Interest Frame as prompt lines both agents share. */
export function renderInterestFrame(frame: InterestFactor[]): string[] {
  if (frame.length === 0) return ["Interest frame: (none defined)"];
  return [
    "Interest frame — the factors to track (factor · key question · indicators):",
    ...frame.map((f) => {
      const question = f.key_question ? ` · ${f.key_question}` : "";
      const indicators =
        f.indicators.length > 0 ? ` · watch: ${f.indicators.join("; ")}` : "";
      return `- ${f.name}${question}${indicators}`;
    }),
  ];
}

/** The topic's analytical-question line, or nothing in monitor mode. */
export function renderAnalyticalQuestion(topic: Topic): string[] {
  return topic.watch_mode === "question" && topic.analytical_question
    ? [`Analytical question to answer: ${topic.analytical_question}`]
    : [];
}
