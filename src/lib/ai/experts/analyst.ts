import { z } from "zod";
import type {
  AnalystAnalysis,
  AnalystMemoryData,
  ReportSections,
  SourceType,
  Topic,
} from "../../types";
import type { Llm } from "../llm";
import { plainReportText } from "./report-text";

/**
 * Analyst — a rigorously neutral expert that interprets each report:
 * what is happening, why it matters, and what may happen next. It keeps
 * its own track record of forward scenarios and must reconcile them
 * against every new report, so its judgment is auditable over time.
 */

const MAX_TRACKED_SCENARIOS = 30;
const MAX_OPEN_SCENARIOS_IN_PROMPT = 12;

export const AnalystSchema = z.object({
  assessment: z
    .string()
    .describe("2-4 sentence analytical read of what is DRIVING the developments — incentives, constraints, power dynamics. Interpretation, not summary."),
  why_it_matters: z
    .array(z.string())
    .describe("2-4 bullets on significance, each grounded in the report's content"),
  outlook: z
    .array(
      z.object({
        scenario: z.string().describe("A concrete forward scenario, under 25 words"),
        likelihood: z.enum(["likely", "possible", "unlikely"]),
        watch_for: z
          .array(z.string())
          .describe("1-3 concrete, observable indicators that would confirm or kill this scenario"),
      }),
    )
    .describe("2-3 forward scenarios; include a previously tracked scenario only if its likelihood changed"),
  scenario_updates: z
    .array(
      z.object({
        scenario: z
          .string()
          .describe("EXACT text of a previously tracked scenario"),
        status: z.enum(["strengthened", "weakened", "resolved"]),
        note: z.string().describe("One sentence on what in this report moved it"),
      }),
    )
    .describe("Reconciliation of previously tracked scenarios against this report; empty if none moved"),
  caveats: z
    .string()
    .describe("Evidence gaps, contested claims, and what would change this assessment"),
});

const normalize = (text: string) => text.trim().toLowerCase();

/**
 * Folds a run's analysis into the analyst's scenario track record.
 * Pure and unit-testable, mirroring the topic-memory delta merge.
 */
export function mergeScenarios(
  memory: AnalystMemoryData,
  analysis: Pick<AnalystAnalysis, "outlook" | "scenario_updates">,
  now: string,
): AnalystMemoryData {
  const byKey = new Map(
    memory.scenarios.map((s) => [normalize(s.scenario), { ...s }]),
  );

  // 1. Apply the analyst's reconciliation of its existing calls.
  for (const update of analysis.scenario_updates) {
    const existing = byKey.get(normalize(update.scenario));
    if (existing && existing.status !== "resolved") {
      existing.status = update.status;
      existing.note = update.note;
      existing.last_reviewed_at = now;
    }
  }

  // 2. Fold in this run's outlook: refresh active scenarios, add new ones.
  for (const outlook of analysis.outlook) {
    const key = normalize(outlook.scenario);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      if (existing.status !== "resolved") {
        existing.likelihood = outlook.likelihood;
        existing.last_reviewed_at = now;
      }
    } else {
      byKey.set(key, {
        id: crypto.randomUUID(),
        scenario: outlook.scenario.trim(),
        likelihood: outlook.likelihood,
        status: "open",
        made_at: now,
        last_reviewed_at: now,
      });
    }
  }

  // Active scenarios first, then resolved history; bounded overall.
  const all = [...byKey.values()].sort(
    (a, b) => b.last_reviewed_at.localeCompare(a.last_reviewed_at),
  );
  const active = all.filter((s) => s.status !== "resolved");
  const resolved = all.filter((s) => s.status === "resolved");
  return {
    scenarios: [...active, ...resolved].slice(0, MAX_TRACKED_SCENARIOS),
  };
}

export interface AnalystSourceSummary {
  source_type: SourceType;
  gist: string;
  novelty: string;
  contradiction: string;
}

export async function runAnalyst(
  llm: Llm,
  topic: Topic,
  sections: ReportSections,
  focus: string,
  memory: AnalystMemoryData,
  extracts: AnalystSourceSummary[],
): Promise<{ analysis: AnalystAnalysis; memory: AnalystMemoryData }> {
  const openScenarios = memory.scenarios
    .filter((s) => s.status !== "resolved")
    .slice(0, MAX_OPEN_SCENARIOS_IN_PROMPT);

  const result = await llm.structured({
    // Report tier: scenario reasoning is genuine synthesis — this is a call
    // where model quality is the product.
    tier: "report",
    schema: AnalystSchema,
    schemaName: "analyst_analysis",
    instructions: [
      "You are a rigorously neutral, evidence-based analyst embedded in a research briefing app.",
      `Your specialization: ${focus}`,
      "Your goal is to help the user understand what is happening, why it matters, and what may happen next.",
      "",
      "Analytical rules:",
      "- Interpret, don't summarize: explain the drivers, incentives, and institutional constraints behind the developments.",
      "- STRICT neutrality: describe every actor's incentives and constraints symmetrically. Never endorse or disparage any party, person, policy, or outcome. Use neutral, non-loaded language.",
      "- Evidence discipline: ground claims in the report and its sources. News = reported developments; Reddit = community sentiment (never evidence of fact); Medium = practitioner interpretation. Label background knowledge as background; flag contested claims as contested.",
      "- Estimative language only (likely / possible / unlikely). No unhedged predictions.",
      "- Every outlook scenario needs concrete, OBSERVABLE watch-for indicators — things that would confirm or kill it.",
      "- When evidence supports more than one reading, present both.",
      "- Reconcile your previously tracked scenarios: report in scenario_updates which this report strengthened, weakened, or resolved, using their EXACT text. Do not re-list an unchanged scenario in outlook.",
      "- If the report contains little of analytical significance, say so plainly and keep every section short.",
    ].join("\n"),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      report: plainReportText(sections),
      sources: extracts,
      previously_tracked_scenarios: openScenarios.map((s) => ({
        scenario: s.scenario,
        likelihood: s.likelihood,
        status: s.status,
        made_at: s.made_at,
      })),
    }),
  });

  const analysis: AnalystAnalysis = {
    assessment: result.assessment.trim(),
    why_it_matters: result.why_it_matters.map((w) => w.trim()).filter(Boolean),
    outlook: result.outlook,
    scenario_updates: result.scenario_updates,
    caveats: result.caveats.trim(),
  };

  return {
    analysis,
    memory: mergeScenarios(memory, analysis, new Date().toISOString()),
  };
}
