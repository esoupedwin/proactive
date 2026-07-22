# PROACTIVE

A mobile-first web app that keeps you updated on topics you care about, so you can hold informed conversations. For each interest you add, it produces a very short AI-generated update from three angles:

- **News** — latest reporting, via OpenAI web search
- **Medium** — what bloggers are arguing, via OpenAI web search scoped to medium.com
- **Reddit** — what communities are discussing, via the Reddit API + OpenAI synthesis

Each interest carries an *"I want to know"* intent that steers what the AI looks for. Updates are fetched on demand and cached in Supabase, with source links attached.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript, Tailwind CSS)
- [Supabase](https://supabase.com) — Postgres + Google authentication
- [OpenAI Responses API](https://platform.openai.com/docs) with the `web_search` tool
- Deployed on [Vercel](https://vercel.com)

## Getting started

See **[SETUP.md](SETUP.md)** for the full walkthrough (Supabase project, Google OAuth, OpenAI key, Vercel deploy). In short:

```bash
cp .env.local.example .env.local  # fill in Supabase + OpenAI keys
npm install
npm run dev
```

## Project layout

```
supabase/migrations/    SQL schema (interests, updates, RLS policies)
src/proxy.ts            Session refresh + route protection
src/lib/supabase/       Browser & server Supabase clients
src/lib/openai.ts       Responses API helpers (web search + summarize)
src/lib/fetchers/       Per-source pipelines: news, medium, reddit
src/app/login/          Google sign-in
src/app/(app)/          Tabs (news | medium | reddit) + settings
src/app/api/fetch/      POST { source } → fetch & cache updates per interest
src/components/         TabBar, SourceFeed, UpdateCard, InterestManager, …
```
