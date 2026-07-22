# PROACTIVE — Setup Guide

Follow these steps once to get the app running locally, then deploy to Vercel.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up / log in → **New project**.
2. Pick any name (e.g. `proactive`), a strong database password, and a region near you.
3. Once created, open **Project Settings → API** and note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Create the database tables

1. In the Supabase dashboard, open **SQL Editor**.
2. Paste the entire contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and click **Run**.
3. You should now see `interests` and `updates` under **Table Editor**, both with RLS enabled.

## 3. Set up Google sign-in

### 3a. Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. `proactive`).
2. **APIs & Services → OAuth consent screen**: configure it — External, app name, your email. Add yourself as a test user (you can publish later).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
     (find the exact value in Supabase under **Authentication → Sign In / Providers → Google** — it shows the callback URL to use)
4. Copy the generated **Client ID** and **Client secret**.

### 3b. Supabase

1. In Supabase: **Authentication → Sign In / Providers → Google** → enable it.
2. Paste the Google **Client ID** and **Client secret**. Save.
3. Under **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` for now (change to your Vercel URL after deploying).
   - **Redirect URLs**: add `http://localhost:3000/auth/callback` (and later `https://your-app.vercel.app/auth/callback`).

## 4. Get an OpenAI API key

1. Go to [platform.openai.com](https://platform.openai.com) → sign up → **API keys** → create a key.
2. Add a small amount of credit under **Billing** (each fetch costs a few cents at most with `gpt-5-mini`).

## 5. Run locally

```bash
cp .env.local.example .env.local   # then fill in the values from steps 1 & 4
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → sign in with Google → **Settings (gear) → Add Interest** → open a tab → **Fetch Latest**.

## 6. Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Framework is auto-detected (Next.js).
3. Under **Environment Variables**, add the same four values as `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`).
4. Deploy. Note your production URL, e.g. `https://proactive.vercel.app`.
5. Back in Supabase **Authentication → URL Configuration**:
   - Set **Site URL** to `https://proactive.vercel.app`
   - Add `https://proactive.vercel.app/auth/callback` to **Redirect URLs**.

Done — the app is live.

## Troubleshooting

- **"Setup required" on the login page** — `.env.local` is missing or the Supabase values are empty. Restart `npm run dev` after editing it.
- **Google sign-in loops back to login** — the redirect URL isn't whitelisted in Supabase **URL Configuration**, or the Site URL is wrong.
- **Fetch fails with "OPENAI_API_KEY is not set"** — add the key to `.env.local` (locally) or Vercel env vars (production) and restart/redeploy.
- **Reddit tab: "Reddit search failed (HTTP 403)"** — Reddit occasionally blocks datacenter IPs; retry, or it may work locally but need retries on Vercel.
