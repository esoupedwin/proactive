import { describe, expect, it } from "vitest";
import {
  attachWikiImages,
  baselineRoster,
  mergeProfiledNames,
  mergeStanceUpdates,
  runPersonalityBaseline,
  runPersonalityProfiles,
  runPersonalityUpdate,
  stancesForOutput,
} from "@/lib/ai/experts/personality";
import type { Llm, StructuredCallOptions } from "@/lib/ai/llm";
import type { ReportSections, Topic, TrackedPersonality } from "@/lib/types";

const topic: Topic = {
  id: "t1",
  user_id: "u1",
  title: "Malaysia Politics",
  description: "Follow Malaysian political developments",
  interest_frame: [],
  watch_mode: "question",
  analytical_question: "Will UMNO leave the Unity Government?",
  detail_level: "standard",
  frequency: "daily",
  status: "active",
  position: 0,
  news_query: null,
  last_generated_at: null,
  last_read_at: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const sections: ReportSections = {
  latest_developments: [
    { text: "Supreme Council met on coalition strategy.", source_refs: [0] },
  ],
  community_reaction: [],
  practitioner_view: [],
  cross_source_takeaway: "Coalition tensions persist.",
  what_changed: [],
  no_meaningful_change: false,
};

const ISSUE = "Will UMNO leave the Unity Government?";

/** Captures the call and returns a canned parse of the given payload. */
function fakeLlm(payload: unknown): {
  llm: Llm;
  captured: () => StructuredCallOptions<unknown>;
} {
  let seen: StructuredCallOptions<unknown> | null = null;
  return {
    llm: {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        seen = options as StructuredCallOptions<unknown>;
        return options.schema.parse(payload);
      },
    },
    captured: () => seen!,
  };
}

function tracked(
  name: string,
  stance: string,
  extra?: Partial<TrackedPersonality>,
): TrackedPersonality {
  return {
    name,
    why_matters: `${name} matters`,
    stance,
    history: [{ at: "2026-08-01T00:00:00Z", stance, note: "baseline" }],
    updated_at: "2026-08-01T00:00:00Z",
    ...extra,
  };
}

describe("runPersonalityBaseline", () => {
  it("scans on the search tier with web search and fences the issue", async () => {
    const { llm, captured } = fakeLlm({
      players: [
        {
          name: "  Ahmad Zahid Hamidi  ",
          why_matters: " Controls party machinery. ",
          stance: " Supports staying. ",
        },
      ],
    });
    const result = await runPersonalityBaseline(llm, topic, ISSUE);

    expect(captured().tier).toBe("search");
    expect(captured().useWebSearch).toBe(true);
    expect(captured().instructions).toContain(`<issue>\n${ISSUE}\n</issue>`);
    expect(result.players).toEqual([
      {
        name: "Ahmad Zahid Hamidi",
        why_matters: "Controls party machinery.",
        stance: "Supports staying.",
      },
    ]);
  });
});

describe("runPersonalityUpdate", () => {
  it("runs on the report tier without web search — judging shifts is interpretation", async () => {
    const { llm, captured } = fakeLlm({
      updates: [
        {
          name: "Ahmad Zahid Hamidi",
          why_matters: "Controls party machinery",
          stance: "Still supports staying",
          trend: "unchanged",
          change_note: "",
        },
      ],
    });
    await runPersonalityUpdate(
      llm,
      topic,
      sections,
      ISSUE,
      [tracked("Ahmad Zahid Hamidi", "Supports staying")],
      [
        {
          source_type: "news",
          title: "Zahid reaffirms coalition support",
          published_at: "2026-08-18",
          gist: "Zahid restated support for the UG.",
          recorded_at: "2026-08-19T00:00:00Z",
        },
      ],
    );

    expect(captured().tier).toBe("report");
    expect(captured().useWebSearch).toBeUndefined();

    const input = JSON.parse(captured().input) as {
      issue: string;
      roster: { name: string; stance_history: unknown[] }[];
      report: string;
      new_extracts: { title: string }[];
    };
    expect(input.issue).toBe(ISSUE);
    expect(input.roster[0]!.name).toBe("Ahmad Zahid Hamidi");
    expect(input.roster[0]!.stance_history).toHaveLength(1);
    expect(input.report).toContain("Supreme Council met on coalition strategy.");
    expect(input.new_extracts[0]!.title).toBe(
      "Zahid reaffirms coalition support",
    );
  });
});

describe("runPersonalityProfiles", () => {
  it("profiles on the search tier with web search, passing known names", async () => {
    const { llm, captured } = fakeLlm({
      profiles: [
        {
          name: " Johari Abdul Ghani ",
          who: " UMNO vice-president. ",
          relevance: " Urged pragmatism in this report. ",
        },
      ],
    });
    const result = await runPersonalityProfiles(llm, topic, sections, [
      "Ahmad Zahid Hamidi",
    ]);

    expect(captured().tier).toBe("search");
    expect(captured().useWebSearch).toBe(true);
    const input = JSON.parse(captured().input) as {
      already_profiled: string[];
    };
    expect(input.already_profiled).toEqual(["Ahmad Zahid Hamidi"]);
    expect(result.profiles[0]).toEqual({
      name: "Johari Abdul Ghani",
      who: "UMNO vice-president.",
      relevance: "Urged pragmatism in this report.",
    });
  });
});

describe("baselineRoster", () => {
  it("starts each person's history at the baseline stance", () => {
    const roster = baselineRoster(
      [{ name: "A", why_matters: "w", stance: "s" }],
      "2026-08-21T00:00:00Z",
    );
    expect(roster).toEqual([
      {
        name: "A",
        why_matters: "w",
        stance: "s",
        history: [{ at: "2026-08-21T00:00:00Z", stance: "s", note: "baseline" }],
        updated_at: "2026-08-21T00:00:00Z",
      },
    ]);
  });
});

describe("mergeStanceUpdates", () => {
  const NOW = "2026-08-21T00:00:00Z";

  it("keeps unchanged stances without touching history", () => {
    const roster = [tracked("A", "Supports staying")];
    const merged = mergeStanceUpdates(
      roster,
      [
        {
          name: "A",
          why_matters: "A matters",
          stance: "Supports staying",
          trend: "unchanged",
          change_note: "",
        },
      ],
      NOW,
    );
    expect(merged[0]!.history).toHaveLength(1);
    expect(merged[0]!.updated_at).toBe("2026-08-01T00:00:00Z");
  });

  it("appends shifted stances to history with the change note", () => {
    const roster = [tracked("A", "Supports staying")];
    const merged = mergeStanceUpdates(
      roster,
      [
        {
          name: "a", // case-insensitive match
          why_matters: "A matters",
          stance: "Now hedging on exit",
          trend: "shifted",
          change_note: "Hinted at review after by-election loss",
        },
      ],
      NOW,
    );
    expect(merged[0]!.stance).toBe("Now hedging on exit");
    expect(merged[0]!.history).toHaveLength(2);
    expect(merged[0]!.history[1]).toEqual({
      at: NOW,
      stance: "Now hedging on exit",
      note: "Hinted at review after by-election loss",
    });
    expect(merged[0]!.updated_at).toBe(NOW);
  });

  it("appends new players and enforces the roster cap", () => {
    const roster = Array.from({ length: 8 }, (_, i) =>
      tracked(`P${i}`, "s"),
    );
    const merged = mergeStanceUpdates(
      roster,
      [
        {
          name: "Overflow",
          why_matters: "w",
          stance: "s",
          trend: "new",
          change_note: "n",
        },
      ],
      NOW,
    );
    expect(merged).toHaveLength(8);
    expect(merged.some((p) => p.name === "Overflow")).toBe(false);

    const withRoom = mergeStanceUpdates(
      roster.slice(0, 3),
      [
        {
          name: "Newcomer",
          why_matters: "Rising faction leader",
          stance: "Opposes exit",
          trend: "new",
          change_note: "Entered the fight publicly",
        },
      ],
      NOW,
    );
    expect(withRoom).toHaveLength(4);
    expect(withRoom[3]!.name).toBe("Newcomer");
    expect(withRoom[3]!.history).toHaveLength(1);
  });
});

describe("stancesForOutput", () => {
  it("marks every stance 'baseline' on the first run", () => {
    const stances = stancesForOutput([tracked("A", "s")], null);
    expect(stances[0]!.trend).toBe("baseline");
    expect(stances[0]!.change_note).toBeNull();
  });

  it("maps trends and keeps change notes only for movement", () => {
    const roster = [tracked("A", "s1"), tracked("B", "s2")];
    const stances = stancesForOutput(roster, [
      {
        name: "A",
        trend: "shifted",
        change_note: "changed after vote",
      },
      { name: "B", trend: "unchanged", change_note: "" },
    ]);
    expect(stances[0]!.trend).toBe("shifted");
    expect(stances[0]!.change_note).toBe("changed after vote");
    expect(stances[1]!.trend).toBe("unchanged");
    expect(stances[1]!.change_note).toBeNull();
  });
});

describe("mergeProfiledNames", () => {
  it("dedupes case-insensitively and appends new names last", () => {
    const merged = mergeProfiledNames({ profiled: ["Ahmad Zahid Hamidi"] }, [
      { name: "ahmad zahid hamidi" },
      { name: "Mohamad Hasan" },
    ]);
    expect(merged).toEqual(["Ahmad Zahid Hamidi", "Mohamad Hasan"]);
  });
});

describe("attachWikiImages", () => {
  it("fetches portraits only for people missing one and tolerates misses", async () => {
    const asked: string[] = [];
    const fetcher = async (name: string) => {
      asked.push(name);
      if (name === "Missing") return null;
      return {
        image_url: `https://img/${name}.jpg`,
        page_url: `https://wiki/${name}`,
        page_title: name,
      };
    };
    const people: Array<{
      name: string;
      image_url?: string | null;
      image_page_url?: string | null;
    }> = [
      { name: "Has", image_url: "https://img/existing.jpg" },
      { name: "Needs" },
      { name: "Missing" },
    ];
    const result = await attachWikiImages(people, fetcher);

    expect(asked).toEqual(["Needs", "Missing"]);
    expect(result[0]!.image_url).toBe("https://img/existing.jpg");
    expect(result[1]!.image_url).toBe("https://img/Needs.jpg");
    expect(result[1]!.image_page_url).toBe("https://wiki/Needs");
    expect(result[2]!.image_url).toBeUndefined();
  });
});
