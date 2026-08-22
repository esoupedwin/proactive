import { Bot, Landmark, MessagesSquare, Users, type LucideIcon } from "lucide-react";
import type { Expert, ExpertKind } from "./types";

/**
 * One place for how each expert kind presents itself: its icon, its title, and
 * what removing it destroys. The briefing panel, the expert grid, the detail
 * page and the add form all read from here, so a new kind is added once rather
 * than in four parallel ternary chains.
 *
 * Surface-specific copy (a tile blurb vs a panel subtitle) stays with its
 * surface — only what is genuinely the same everywhere lives here.
 */

interface ExpertKindMeta {
  title: string;
  Icon: LucideIcon;
  /**
   * A noun phrase completing "…also deletes ___." Written to fit both the
   * confirm dialog and the explanatory note beneath it.
   */
  deletes: string;
}

export const EXPERT_KINDS: Record<ExpertKind, ExpertKindMeta> = {
  mentor: {
    title: "Mentor",
    Icon: Bot,
    deletes: "what it remembers teaching you for this topic",
  },
  analyst: {
    title: "Analyst",
    Icon: Landmark,
    deletes: "its commentary on this topic's reports",
  },
  sentiment: {
    title: "Sentiment",
    Icon: MessagesSquare,
    deletes: "its sentiment readings on this topic's reports",
  },
  personality: {
    title: "Personality",
    Icon: Users,
    deletes: "its tracked people and their stance history for this topic",
  },
};

/** The kind's icon. Decorative by default — the name is always beside it. */
export function ExpertIcon({
  kind,
  className = "size-5",
}: {
  kind: ExpertKind;
  className?: string;
}) {
  const { Icon } = EXPERT_KINDS[kind];
  return <Icon className={className} aria-hidden />;
}

/** Confirm text for removing an expert. */
export function removeExpertConfirm(expert: Expert): string {
  return `Remove ${expert.name}? This also deletes ${EXPERT_KINDS[expert.kind].deletes}.`;
}

/** The same warning as a statement, for the note beneath the button. */
export function removeExpertNote(expert: Expert): string {
  return `Removing ${expert.name} also deletes ${EXPERT_KINDS[expert.kind].deletes}.`;
}
