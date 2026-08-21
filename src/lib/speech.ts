import { stripEntityMarkers } from "./entities";
import { stripMarkdownLinks } from "./md-links";
import { takeawayPoints } from "./reports";
import {
  isAnalystCommentary,
  type AnalystAnalysis,
  type Expert,
  type ExpertOutput,
  type MentorTip,
  type PersonalityOutput,
  type ReportSections,
  type ScenarioLikelihood,
  type TrendingMomentum,
} from "./types";

/**
 * Builds a plain-text script meant to be pasted into a text-to-speech app and
 * listened to hands-free. Pure and deterministic — no model call.
 *
 * Everything here optimises for the ear, not the eye: no markdown, no citation
 * markers, no bullet glyphs, and section changes announced in words because a
 * listener cannot see a heading.
 */

export interface SpeechExpertItem {
  expert: Pick<Expert, "kind" | "name">;
  output: Pick<ExpertOutput, "output"> | null;
}

/** Spoken date — "31 July 2026" reads better than a timestamp. */
function spokenDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Strips entity markers and guarantees terminal punctuation so TTS pauses. */
function sentence(text: string): string {
  const clean = stripEntityMarkers(text).trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function bulletsToProse(bullets: { text: string }[]): string[] {
  return bullets.map((b) => sentence(b.text)).filter(Boolean);
}

/** A section only appears when it has something to say. */
function section(heading: string, lines: string[]): string[] {
  const body = lines.filter(Boolean);
  return body.length === 0 ? [] : [heading, ...body];
}

const LIKELIHOOD_PHRASE: Record<ScenarioLikelihood, string> = {
  likely: "Likely",
  possible: "Possible",
  unlikely: "Unlikely",
};

const MOMENTUM_PHRASE: Record<TrendingMomentum, string> = {
  new: "newly trending",
  rising: "gaining attention",
  steady: "holding attention",
  fading: "losing steam",
};

function mentorLines(name: string, tips: MentorTip[]): string[] {
  if (tips.length === 0) return [];
  const lines = tips.flatMap((tip) => {
    const concept = stripEntityMarkers(tip.concept).trim();
    const body = sentence(tip.tip);
    if (!body) return [];
    const opener = concept ? `${concept}. ` : "";
    // "more" is only present if the user expanded the tip; include it so the
    // spoken version matches what is on screen.
    const more = tip.more ? ` ${sentence(tip.more)}` : "";
    return [`${opener}${body}${more}`];
  });
  return section(`From ${name}.`, lines);
}

function analystLines(name: string, analysis: AnalystAnalysis): string[] {
  if (isAnalystCommentary(analysis)) {
    const commentary = sentence(analysis.commentary);
    return section(`From ${name}.`, commentary ? [commentary] : []);
  }

  const lines: string[] = [];

  const assessment = sentence(analysis.assessment);
  if (assessment) lines.push(assessment);

  if (analysis.why_it_matters?.length) {
    lines.push("Why this matters.");
    lines.push(...analysis.why_it_matters.map(sentence).filter(Boolean));
  }

  if (analysis.outlook?.length) {
    lines.push("Looking ahead.");
    for (const item of analysis.outlook) {
      const scenario = sentence(item.scenario);
      if (!scenario) continue;
      const watch = item.watch_for?.length
        ? ` Watch for: ${item.watch_for.map((w) => stripEntityMarkers(w).trim()).filter(Boolean).join("; ")}.`
        : "";
      lines.push(`${LIKELIHOOD_PHRASE[item.likelihood]}. ${scenario}${watch}`);
    }
  }

  if (analysis.scenario_updates?.length) {
    lines.push("Revisiting earlier calls.");
    for (const update of analysis.scenario_updates) {
      const scenario = stripEntityMarkers(update.scenario).trim();
      if (!scenario) continue;
      lines.push(`${scenario} — ${update.status}. ${sentence(update.note)}`);
    }
  }

  const caveats = sentence(analysis.caveats ?? "");
  if (caveats) lines.push(`One caveat. ${caveats}`);

  return section(`From ${name}.`, lines);
}

function personalityLines(
  name: string,
  personality: PersonalityOutput,
): string[] {
  if (personality.mode === "profiles") {
    const lines = (personality.profiles ?? []).flatMap((p) => {
      const person = stripEntityMarkers(p.name).trim();
      // Citation links are for the eye; spoken, they are just noise.
      const who = sentence(stripMarkdownLinks(p.who));
      if (!person || !who) return [];
      const relevance = sentence(stripMarkdownLinks(p.relevance));
      return [`${person}. ${who}${relevance ? ` ${relevance}` : ""}`];
    });
    return section(`From ${name}.`, lines);
  }

  const issue = personality.issue
    ? sentence(`On the question: ${personality.issue}`)
    : "";
  const lines = (personality.stances ?? []).flatMap((s) => {
    const person = stripEntityMarkers(s.name).trim();
    // Citation links are for the eye; spoken, they are just noise.
    const stance = sentence(stripMarkdownLinks(s.stance));
    if (!person || !stance) return [];
    // Spoken, only movement is worth announcing; the roster reads flat.
    const shift =
      s.trend === "shifted" && s.change_note
        ? ` Position shifted: ${sentence(stripMarkdownLinks(s.change_note))}`
        : s.trend === "new"
          ? " Newly tracked."
          : "";
    return [`${person}. ${stance}${shift}`];
  });
  return section(
    `From ${name}.`,
    lines.length > 0 ? [issue, ...lines].filter(Boolean) : [],
  );
}

/**
 * Renders the topic's current briefing — report plus every expert's output —
 * as a continuous spoken script.
 */
export function buildSpeechScript(options: {
  topicTitle: string;
  sections: ReportSections;
  reportDate?: string | null;
  experts?: SpeechExpertItem[];
}): string {
  const { topicTitle, sections, reportDate, experts = [] } = options;

  const date = spokenDate(reportDate);
  const parts: string[] = [
    date
      ? `${topicTitle}. Your briefing from ${date}.`
      : `${topicTitle}. Your latest briefing.`,
  ];

  if (sections.no_meaningful_change) {
    parts.push(
      sections.verdict
        ? "Nothing new bears on this question since the previous update; the standing assessment follows."
        : sections.trending
          ? "Attention hasn't shifted meaningfully since the previous update."
          : "Nothing significant has changed for this topic since the previous update.",
    );
  }

  if (sections.trending) {
    // Trending mode: each subject with its momentum, mood, and talking point.
    for (const item of sections.trending) {
      const subject = stripEntityMarkers(item.subject).trim();
      if (!subject) continue;
      const mood = stripEntityMarkers(item.mood).trim();
      parts.push(
        ...section(`${subject} — ${MOMENTUM_PHRASE[item.momentum]}.`, [
          mood ? `The mood: ${mood}.` : "",
          ...bulletsToProse(item.bullets),
          item.talking_point
            ? `You could say: ${sentence(item.talking_point)}`
            : "",
        ]),
      );
    }
    parts.push(
      ...section(
        "Here's what changed since last time.",
        bulletsToProse(sections.what_changed),
      ),
    );
  } else if (sections.verdict) {
    // Question-mode assessment: verdict, factor evidence, what changed.
    const v = sections.verdict;
    parts.push(
      ...section("Here's the current assessment.", [
        `${LIKELIHOOD_PHRASE[v.likelihood]}, with ${v.confidence} confidence. ${sentence(v.answer)}`,
        ...bulletsToProse(v.rationale),
      ]),
    );
    for (const fa of sections.factor_assessments ?? []) {
      parts.push(
        ...section(
          `On ${stripEntityMarkers(fa.factor)}.`,
          bulletsToProse(fa.bullets),
        ),
      );
    }
    parts.push(
      ...section(
        "Here's what changed since last time.",
        bulletsToProse(sections.what_changed),
      ),
    );
  } else {
    parts.push(
      ...section(
        "Here's the overall takeaway.",
        takeawayPoints(sections.cross_source_takeaway).map(sentence),
      ),
      ...section(
        "Now the latest developments.",
        bulletsToProse(sections.latest_developments),
      ),
      ...section(
        "Here's what the community is saying on Reddit.",
        bulletsToProse(sections.community_reaction),
      ),
      ...section(
        "And what practitioners are writing on Medium.",
        bulletsToProse(sections.practitioner_view),
      ),
      ...section(
        "Here's what changed since last time.",
        bulletsToProse(sections.what_changed),
      ),
    );
  }

  for (const { expert, output } of experts) {
    if (!output) continue;
    if (expert.kind === "analyst" && output.output.analysis) {
      parts.push(...analystLines(expert.name, output.output.analysis));
    } else if (expert.kind === "mentor" && output.output.tips?.length) {
      parts.push(...mentorLines(expert.name, output.output.tips));
    } else if (expert.kind === "personality" && output.output.personality) {
      parts.push(...personalityLines(expert.name, output.output.personality));
    } else if (expert.kind === "sentiment" && output.output.sentiment) {
      // Citation links are for the eye; spoken, they are just noise.
      const s = output.output.sentiment;
      const lines = (s.points ?? [s.commentary ?? ""])
        .map((p) => sentence(stripMarkdownLinks(p)))
        .filter(Boolean);
      parts.push(...section(`From ${expert.name}.`, lines));
    }
  }

  parts.push("That's the end of your briefing.");

  // Blank line between every line so speech apps pause at the breaks.
  return parts.filter(Boolean).join("\n\n");
}
