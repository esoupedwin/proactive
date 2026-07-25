import type {
  DetailLevel,
  ReportSections,
  SourceType,
  TopicMemory,
  UpdateFrequency,
} from "./types";

/**
 * Sample topics + reports so the UI can be exercised before OpenAI
 * integration is configured. Sources use example.com URLs and are clearly
 * marked as samples.
 */

export interface SeedSource {
  source_type: SourceType;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  gist: string;
  relevance: string;
  novelty: string;
}

export interface SeedReport {
  /** How many days before "now" this report was generated. */
  days_ago: number;
  summary: string;
  sections: ReportSections;
  sources: SeedSource[];
}

export interface SeedTopic {
  title: string;
  description: string;
  interest_areas: string[];
  detail_level: DetailLevel;
  frequency: UpdateFrequency;
  reports: SeedReport[];
  memory: Pick<
    TopicMemory,
    "reported_developments" | "themes" | "facts" | "open_questions"
  >;
}

const bullet = (text: string, ...source_refs: number[]) => ({
  text,
  source_refs,
});

export const SEED_TOPICS: SeedTopic[] = [
  {
    title: "Latest top LLMs",
    description:
      "I want to understand where the frontier LLM landscape is heading and what the emerging consensus is across different information sources.",
    interest_areas: [
      "Top models for reasoning",
      "Top models for coding",
      "Efficiency and cost",
      "Agentic capabilities",
      "Rumors about upcoming models",
    ],
    detail_level: "standard",
    frequency: "daily",
    reports: [
      {
        days_ago: 3,
        summary:
          "Baseline briefing: benchmark leadership dominates the frontier-model conversation.",
        sections: {
          latest_developments: [
            bullet(
              "A new frontier model release cycle is under way, with vendors emphasizing benchmark leadership in reasoning and coding.",
              0,
            ),
            bullet(
              "Pricing pressure is increasing as open-weight models close the gap on coding tasks.",
              1,
            ),
          ],
          community_reaction: [
            bullet(
              "Developers are debating whether benchmark scores still predict real-world coding performance.",
              2,
            ),
          ],
          practitioner_view: [
            bullet(
              "Early practitioner reviews focus on head-to-head comparisons across standard benchmark suites.",
              3,
            ),
          ],
          cross_source_takeaway:
            "The conversation is still framed around leaderboard position: which model tops reasoning and coding benchmarks this month.",
          what_changed: [
            bullet(
              "This is the initial briefing for this topic and sets the baseline.",
            ),
          ],
          no_meaningful_change: false,
        },
        sources: [
          {
            source_type: "news",
            title: "Frontier model race heats up with new releases (sample)",
            publisher: "TechWire (sample)",
            url: "https://example.com/news/frontier-race",
            published_at: "2026-07-20",
            gist: "Vendors announced new frontier models emphasizing benchmark wins.",
            relevance: "Directly tracks frontier LLM releases.",
            novelty: "new",
          },
          {
            source_type: "news",
            title: "Open-weight models undercut API pricing (sample)",
            publisher: "AI Business Daily (sample)",
            url: "https://example.com/news/open-weight-pricing",
            published_at: "2026-07-21",
            gist: "Open-weight coding models are pressuring proprietary pricing.",
            relevance: "Efficiency and cost interest area.",
            novelty: "new",
          },
          {
            source_type: "reddit",
            title: "Do benchmarks still matter? (sample)",
            publisher: "r/LocalLLaMA",
            url: "https://example.com/reddit/benchmarks-matter",
            published_at: "2026-07-21",
            gist: "Community debate on benchmark validity for real coding work.",
            relevance: "Community consensus on model evaluation.",
            novelty: "new",
          },
          {
            source_type: "medium",
            title: "I tested five frontier models on the same tasks (sample)",
            publisher: "Sample Practitioner",
            url: "https://example.com/medium/five-models",
            published_at: "2026-07-19",
            gist: "Side-by-side benchmark-style comparison of frontier models.",
            relevance: "Practitioner evaluation methodology.",
            novelty: "new",
          },
        ],
      },
      {
        days_ago: 0,
        summary:
          "New releases from Anthropic, Google and Moonshot shift the conversation from benchmarks to task fit.",
        sections: {
          hero_image: {
            url: "https://picsum.photos/seed/proactive-llms/800/450",
            source_ref: 0,
            alt: "Sample cover image for the LLM releases briefing",
          },
          latest_developments: [
            bullet(
              "Anthropic released Claude Opus 5, positioned as a lower-cost enterprise model with stronger coding performance and additional safety features.",
              0,
            ),
            bullet(
              "Google launched Gemini 3.6 Flash together with Gemini 3.5 Flash-Lite and a cybersecurity-focused Flash variant, while Gemini 3.5 Pro remains delayed.",
              1,
            ),
            bullet(
              "Moonshot AI released Kimi K3, an open-weight frontier model attracting significant attention for coding and cost efficiency.",
              2,
            ),
          ],
          community_reaction: [
            bullet(
              "Developers are excited by Kimi K3, with many comparing its coding ability against Claude and GPT.",
              3,
            ),
            bullet(
              "Many users believe Google's Gemini 3.5 Pro delay is allowing competitors to widen their lead.",
              4,
            ),
            bullet(
              "There is growing discussion that enterprises should evaluate models on real-world coding, reliability, and price rather than benchmark scores alone.",
              3, 4,
            ),
          ],
          practitioner_view: [
            bullet(
              "Early reviews suggest organizations are increasingly adopting multiple LLMs instead of standardizing on a single provider.",
              5,
            ),
            bullet(
              "Several practitioners recommend routing tasks (coding, reasoning, summarization) to different models depending on their strengths.",
              5,
            ),
          ],
          cross_source_takeaway:
            'Across news, developer discussions, and practitioner blogs, the conversation is shifting from "Which LLM is the smartest?" to "Which LLM is best for this job?" New releases are increasingly evaluated on coding performance, agentic workflows, latency, and cost — not benchmark rankings alone.',
          what_changed: [
            bullet(
              "Earlier reporting focused mainly on model benchmark leadership.",
            ),
            bullet(
              "The latest discussion places greater weight on task routing, cost, and real-world reliability.",
              5,
            ),
          ],
          no_meaningful_change: false,
        },
        sources: [
          {
            source_type: "news",
            title: "Anthropic launches Claude Opus 5 (sample)",
            publisher: "TechWire (sample)",
            url: "https://example.com/news/claude-opus-5",
            published_at: "2026-07-23",
            gist: "Claude Opus 5 targets enterprise coding at a lower price point.",
            relevance: "Major frontier model release.",
            novelty: "new",
          },
          {
            source_type: "news",
            title: "Google expands Gemini Flash family (sample)",
            publisher: "AI Business Daily (sample)",
            url: "https://example.com/news/gemini-36-flash",
            published_at: "2026-07-22",
            gist: "Gemini 3.6 Flash and variants ship while 3.5 Pro stays delayed.",
            relevance: "Frontier release cadence and delays.",
            novelty: "new",
          },
          {
            source_type: "news",
            title: "Moonshot's Kimi K3 goes open-weight (sample)",
            publisher: "The Model Report (sample)",
            url: "https://example.com/news/kimi-k3",
            published_at: "2026-07-23",
            gist: "Kimi K3 released with open weights and strong coding results.",
            relevance: "Open-weight frontier competition.",
            novelty: "new",
          },
          {
            source_type: "reddit",
            title: "Kimi K3 vs Claude vs GPT for coding (sample)",
            publisher: "r/LocalLLaMA",
            url: "https://example.com/reddit/kimi-k3-coding",
            published_at: "2026-07-24",
            gist: "Developers benchmark Kimi K3 against proprietary coding models.",
            relevance: "Community coding comparisons.",
            novelty: "new",
          },
          {
            source_type: "reddit",
            title: "Is Google falling behind? (sample)",
            publisher: "r/singularity",
            url: "https://example.com/reddit/google-behind",
            published_at: "2026-07-23",
            gist: "Thread arguing the 3.5 Pro delay is costing Google mindshare.",
            relevance: "Community read on vendor momentum.",
            novelty: "new",
          },
          {
            source_type: "medium",
            title: "Stop picking one LLM: route your tasks (sample)",
            publisher: "Sample Practitioner",
            url: "https://example.com/medium/route-your-tasks",
            published_at: "2026-07-22",
            gist: "Argues for multi-model adoption and per-task routing.",
            relevance: "Practitioner operating patterns.",
            novelty: "new",
          },
        ],
      },
    ],
    memory: {
      reported_developments: [],
      themes: [
        {
          theme: "Evaluation shifting from benchmarks to task fit",
          trend: "strengthening across all three channels",
        },
        {
          theme: "Open-weight models pressuring proprietary pricing",
          trend: "growing",
        },
      ],
      facts: [
        {
          fact: "Claude Opus 5 was released positioned for enterprise coding at lower cost (sample)",
          entities: ["Anthropic", "Claude Opus 5"],
          confidence: "high",
          source_note: "Sample news coverage, 23 Jul 2026",
        },
        {
          fact: "Gemini 3.5 Pro release remains delayed (sample)",
          entities: ["Google", "Gemini 3.5 Pro"],
          confidence: "medium",
          source_note: "Sample news coverage, 22 Jul 2026",
        },
      ],
      open_questions: [
        {
          question: "When will Gemini 3.5 Pro actually ship?",
          context: "Delay reported; no confirmed date (sample).",
        },
      ],
    },
  },
  {
    title: "US–Iran Conflict",
    description:
      "I want to understand the latest military, diplomatic, political, and economic developments in the US–Iran conflict and how expert and public interpretations are changing.",
    interest_areas: [
      "Military developments",
      "Diplomatic negotiations",
      "Regional actors",
      "Energy and maritime security",
      "Escalation risks",
    ],
    detail_level: "standard",
    frequency: "daily",
    reports: [
      {
        days_ago: 1,
        summary:
          "Strikes expand beyond coastal targets while both sides posture for negotiating leverage.",
        sections: {
          hero_image: {
            url: "https://picsum.photos/seed/proactive-gulf/800/450",
            source_ref: 0,
            alt: "Sample cover image for the US–Iran conflict briefing",
          },
          latest_developments: [
            bullet(
              "The US has expanded airstrikes beyond coastal military targets to include logistics and infrastructure supporting Iranian military operations.",
              0,
            ),
            bullet(
              "Iran has continued retaliatory missile and drone attacks against US bases and maritime targets across the Gulf region.",
              1,
            ),
          ],
          community_reaction: [
            bullet(
              "Many believe neither side wants a prolonged full-scale war, but both are trying to increase pressure before negotiations.",
              2,
            ),
            bullet(
              "Debate continues over whether the Strait of Hormuz has become the conflict's primary leverage rather than Iran's nuclear program.",
              3,
            ),
          ],
          practitioner_view: [
            bullet(
              "Analysts argue the conflict has evolved from a nuclear dispute into a broader contest over regional deterrence and maritime security.",
              4,
            ),
          ],
          cross_source_takeaway:
            "Across news reporting, community discussions, and expert analysis, there is broad agreement that the conflict is entering a prolonged pressure phase. Military operations continue to intensify, particularly around Gulf security and shipping lanes.",
          what_changed: [
            bullet(
              "This is the initial briefing for this topic and sets the baseline.",
            ),
          ],
          no_meaningful_change: false,
        },
        sources: [
          {
            source_type: "news",
            title: "US widens strike campaign to logistics targets (sample)",
            publisher: "World News Service (sample)",
            url: "https://example.com/news/us-strikes-logistics",
            published_at: "2026-07-24",
            gist: "Strikes now include supply and infrastructure targets.",
            relevance: "Military developments.",
            novelty: "new",
          },
          {
            source_type: "news",
            title: "Iran launches retaliatory drone attacks in Gulf (sample)",
            publisher: "Global Wire (sample)",
            url: "https://example.com/news/iran-retaliation",
            published_at: "2026-07-24",
            gist: "Missile and drone attacks target US bases and shipping.",
            relevance: "Escalation tracking.",
            novelty: "new",
          },
          {
            source_type: "reddit",
            title: "Is this heading to full-scale war? (sample)",
            publisher: "r/geopolitics",
            url: "https://example.com/reddit/full-scale-war",
            published_at: "2026-07-24",
            gist: "Community consensus: pressure tactics, not total war.",
            relevance: "Public interpretation of escalation risk.",
            novelty: "new",
          },
          {
            source_type: "reddit",
            title: "Hormuz is the real story (sample)",
            publisher: "r/CredibleDefense",
            url: "https://example.com/reddit/hormuz-leverage",
            published_at: "2026-07-23",
            gist: "Thread arguing maritime chokepoints are the key leverage.",
            relevance: "Energy and maritime security.",
            novelty: "new",
          },
          {
            source_type: "medium",
            title: "From nuclear file to deterrence contest (sample)",
            publisher: "Sample Analyst",
            url: "https://example.com/medium/deterrence-contest",
            published_at: "2026-07-23",
            gist: "Argues the conflict's framing has shifted to regional deterrence.",
            relevance: "Expert interpretation shift.",
            novelty: "new",
          },
        ],
      },
    ],
    memory: {
      reported_developments: [],
      themes: [
        {
          theme: "Prolonged pressure phase rather than full-scale war",
          trend: "consensus forming",
        },
      ],
      facts: [],
      open_questions: [
        {
          question: "Will Strait of Hormuz disruption trigger wider escalation?",
          context: "Debated across channels (sample).",
        },
      ],
    },
  },
  {
    title: "Product Management and AI",
    description:
      "I want to understand how AI is changing product management practices, product discovery, delivery, analytics, and team operating models.",
    interest_areas: [
      "AI product discovery",
      "AI-assisted product management",
      "Agentic workflows",
      "Product analytics",
      "Emerging operating models",
    ],
    detail_level: "standard",
    frequency: "weekly",
    reports: [
      {
        days_ago: 2,
        summary:
          "PM tooling consolidates around agentic workflows; discovery and analytics are automating fastest.",
        sections: {
          hero_image: {
            url: "https://picsum.photos/seed/proactive-pm/800/450",
            source_ref: 0,
            alt: "Sample cover image for the product management and AI briefing",
          },
          latest_developments: [
            bullet(
              "Major product tools are shipping agent features that draft PRDs, synthesize user research, and triage feedback automatically.",
              0,
            ),
            bullet(
              "New analytics products claim to close the loop from user behavior to prioritized backlog items.",
              1,
            ),
          ],
          community_reaction: [
            bullet(
              "PM communities are split on whether AI drafting erodes or sharpens product judgment.",
              2,
            ),
          ],
          practitioner_view: [
            bullet(
              "Practitioners describe smaller PM teams operating with agent support for research synthesis and spec drafting.",
              3,
            ),
            bullet(
              "Several writers argue discovery — not delivery — is where AI currently adds the most value.",
              4,
            ),
          ],
          cross_source_takeaway:
            "Tooling, community sentiment, and practitioner writing all point the same direction: AI is compressing the research-to-spec cycle, and the emerging operating model pairs fewer PMs with always-on agent support.",
          what_changed: [
            bullet(
              "This is the initial briefing for this topic and sets the baseline.",
            ),
          ],
          no_meaningful_change: false,
        },
        sources: [
          {
            source_type: "news",
            title: "Product suites race to add PM agents (sample)",
            publisher: "SaaS Report (sample)",
            url: "https://example.com/news/pm-agents",
            published_at: "2026-07-22",
            gist: "Agent features for PRDs, research synthesis, feedback triage.",
            relevance: "AI-assisted product management.",
            novelty: "new",
          },
          {
            source_type: "news",
            title: "Analytics tools promise behavior-to-backlog automation (sample)",
            publisher: "TechWire (sample)",
            url: "https://example.com/news/behavior-to-backlog",
            published_at: "2026-07-21",
            gist: "New products connect usage analytics to prioritization.",
            relevance: "Product analytics interest area.",
            novelty: "new",
          },
          {
            source_type: "reddit",
            title: "Is AI making PMs lazy or better? (sample)",
            publisher: "r/ProductManagement",
            url: "https://example.com/reddit/ai-pm-debate",
            published_at: "2026-07-23",
            gist: "Split opinions on AI drafting and product judgment.",
            relevance: "Community sentiment.",
            novelty: "new",
          },
          {
            source_type: "medium",
            title: "Running a two-PM org with agents (sample)",
            publisher: "Sample PM Writer",
            url: "https://example.com/medium/two-pm-org",
            published_at: "2026-07-22",
            gist: "Case study of a lean PM team using agent support.",
            relevance: "Emerging operating models.",
            novelty: "new",
          },
          {
            source_type: "medium",
            title: "AI's real PM win is discovery (sample)",
            publisher: "Sample PM Writer",
            url: "https://example.com/medium/discovery-win",
            published_at: "2026-07-20",
            gist: "Argues discovery benefits most from AI today.",
            relevance: "AI product discovery.",
            novelty: "new",
          },
        ],
      },
    ],
    memory: {
      reported_developments: [],
      themes: [
        {
          theme: "Research-to-spec cycle compression",
          trend: "accelerating",
        },
      ],
      facts: [],
      open_questions: [
        {
          question: "Do agent-supported lean PM teams sustain quality at scale?",
          context: "Early anecdotes only (sample).",
        },
      ],
    },
  },
];
