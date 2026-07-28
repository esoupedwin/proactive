# Proactive

A personalized AI research companion. Proactive continuously monitors topics you care about, identifies what is genuinely new, synthesizes information across news, Reddit, and Medium, remembers what you were already told, and produces concise briefings that improve your understanding over time.

Not a news reader — a personal research analyst.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS 4** — mobile-first editorial UI
- **Supabase** — Postgres, Google auth, Row Level Security
- **OpenAI API** (Responses API + web search + structured outputs)
- **Vercel** — hosting + cron-based scheduled updates
- **Vitest** — unit + mocked-AI integration tests

## How it works

> Full step-by-step walkthrough: [docs/pipeline.md](docs/pipeline.md)

Per topic, an update runs a six-module pipeline (`src/lib/ai/`):

1. **Planner** (`planner.ts`) — turns the topic description + interest areas into search queries.
2. **Seeker** (`seeker.ts`) — web-searches news first, then Reddit, then Medium.
3. **Extractor** (`extractor.ts`) — converts each source into a structured extract (gist, relevance, novelty vs. what the user was already told, contradictions).
4. **Deduplicator** (`dedupe.ts`) — deterministic URL + title-similarity merging of repeated coverage.
5. **Reporter** (`reporter.ts`) — reads new extracts, the previous report, topic memory, and user preferences; writes the structured briefing (Latest Developments / Community Reaction / Practitioner View / Cross-Source Takeaway / What Changed). Every bullet cites stored sources; bullets with invented citations are dropped (`sanitizeDraft`).
6. **Memory updater** (`memory.ts`) — folds the report into topic memory: reported developments, emerging themes, key facts (with entities + confidence), open questions.

Memory model:

- **User memory** — `profiles` (default detail level, expertise, last-viewed topic)
- **Topic memory** — `topic_memory` (reported developments, themes)
- **Knowledge memory** — `topic_memory.facts` / `open_questions` (entities, confidence, contradictions), stored as bounded JSON — intentionally not a full knowledge graph yet.

## Local setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (tables, RLS policies, profile trigger).
3. Enable the **Google** provider under *Authentication → Providers*:
   - Create OAuth credentials in Google Cloud Console (Web application).
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Paste the client ID/secret into Supabase.
4. Under *Authentication → URL Configuration*, add `http://localhost:3000/**` (and later your Vercel URL) to the redirect allow list.
5. Copy the project URL, anon key, and service-role key into `.env.local`.

### 3. OpenAI

Set `OPENAI_API_KEY` in `.env.local`. Two model tiers are configurable:

- `OPENAI_SEARCH_MODEL` — planning, web search (needs web-search tool support), extraction, memory updates, and experts. Everything mechanical.
- `OPENAI_REPORT_MODEL` — writing the briefing itself. The only call whose output the user reads directly, so it gets the stronger model.

Costs are estimated from a price table in `src/lib/ai/usage.ts`; override or extend it without code changes via `OPENAI_PRICING_JSON`, e.g. `{"gpt-5-mini":{"input":0.25,"output":2}}` (USD per 1M tokens). Per-step tokens and cost for any report are visible under the topic's **Tokens** button.

### 4. Run

```bash
npm run dev
```

Sign in with Google. On first login you'll land on onboarding — choose **Start with sample topics** to seed the three demo topics (“Latest top LLMs”, “US–Iran Conflict”, “Product Management and AI”) with example reports and sources, so the whole UI is testable **before** any OpenAI configuration.

### 5. Tests & checks

```bash
npm run typecheck   # strict TypeScript
npm test            # unit tests + mocked-AI pipeline integration test
npm run build
```

## Deployment (Vercel)

1. Push the repo to GitHub and import into Vercel.
2. Add all env vars from `.env.example` (use your production values; set `CRON_SECRET` to a long random string — Vercel sends it automatically as `Authorization: Bearer <CRON_SECRET>` to cron routes).
3. `vercel.json` schedules `GET /api/cron` daily at 08:00 UTC. The route finds active topics that are due (daily/weekly cadence, skipping paused and manual topics), and generates up to 5 reports per run using the service-role client.
4. Add your production URL to the Supabase auth redirect allow list.

## Routes

| Route | Purpose |
| --- | --- |
| `/login` | Google sign-in |
| `/` , `/topics` | Redirect to most recently viewed topic (or onboarding) |
| `/onboarding` | First-run: add a topic or seed samples |
| `/topics/new` | Add interest |
| `/topics/[id]` | Topic briefing (main screen) |
| `/topics/[id]/edit` | Edit interest |
| `/topics/[id]/history` | Report history |
| `/topics/[id]/history/[reportId]` | Archived report |
| `/settings` | Profile, preferences, manage interests |
| `POST /api/topics/[id]/generate` | Manual update (concurrency-guarded) |
| `GET /api/cron` | Scheduled updates (secret-protected) |

## Security notes

- All tables enforce RLS scoped to `auth.uid()` — users only ever see their own topics, reports, sources, and memory.
- The generate route re-authenticates via the session cookie; the cron route requires the `CRON_SECRET` bearer token and is excluded from the auth-redirect middleware.
- The service-role key is used only in `/api/cron` (server-side).
