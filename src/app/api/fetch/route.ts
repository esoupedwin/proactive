import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchers } from "@/lib/fetchers";
import { isNoNewUpdates } from "@/lib/fetchers/shared";
import { extractKeyPoints } from "@/lib/openai";
import { isSource, type Interest } from "@/lib/types";

// Fetching several interests in parallel can take a while.
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { source?: string; interestId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { source, interestId } = body;
  if (!source || !isSource(source)) {
    return NextResponse.json(
      { error: "source must be one of news | medium | reddit" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("interests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (interestId) {
    query = query.eq("id", interestId);
  }
  const { data: interests, error: interestsError } = await query;

  if (interestsError) {
    return NextResponse.json({ error: interestsError.message }, { status: 500 });
  }
  if (!interests || interests.length === 0) {
    return NextResponse.json(
      { error: "No interests yet — add one in Settings first." },
      { status: 400 }
    );
  }

  const fetcher = fetchers[source];
  const encoder = new TextEncoder();

  // Stream NDJSON events so the client can show live per-interest status:
  //   {type:"status", interestId, name, message}
  //   {type:"result", interestId, name, ok, error?}
  //   {type:"done", results}
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      const results = await Promise.all(
        (interests as Interest[]).map(async (interest) => {
          const base = { interestId: interest.id, name: interest.name };
          try {
            // Long-term memory + the cached update steer the search toward what's new.
            const [{ data: memoryRows }, { data: previousRow }] =
              await Promise.all([
                supabase
                  .from("memories")
                  .select("content")
                  .eq("interest_id", interest.id)
                  .order("created_at", { ascending: false })
                  .limit(20),
                supabase
                  .from("updates")
                  .select("content")
                  .eq("interest_id", interest.id)
                  .eq("source", source)
                  .maybeSingle(),
              ]);
            const memories = (memoryRows ?? []).map((m) => m.content);
            const previous = previousRow?.content as string | undefined;

            const { content, sources } = await fetcher(interest, {
              onStatus: (message) => send({ type: "status", ...base, message }),
              memories,
              previous,
            });

            // Nothing changed since the cached update: keep it, stamp the check.
            if (previous && isNoNewUpdates(content)) {
              await supabase
                .from("updates")
                .update({ last_checked_at: new Date().toISOString() })
                .eq("interest_id", interest.id)
                .eq("source", source);

              const row = { ...base, ok: true as const, noChange: true };
              send({ type: "result", ...row });
              return row;
            }

            const { error: upsertError } = await supabase
              .from("updates")
              .upsert(
                {
                  user_id: user.id,
                  interest_id: interest.id,
                  source,
                  content,
                  sources,
                  fetched_at: new Date().toISOString(),
                  last_checked_at: null,
                },
                { onConflict: "interest_id,source" }
              );

            if (upsertError) throw new Error(upsertError.message);

            // Grow memory: extract new key points from this update.
            send({ type: "status", ...base, message: "Updating memory…" });
            let memoriesAdded = 0;
            try {
              const points = await extractKeyPoints({
                interestName: interest.name,
                intent: interest.intent,
                source,
                updateContent: content,
                existing: memories,
              });
              if (points.length > 0) {
                const { error: memError } = await supabase
                  .from("memories")
                  .insert(
                    points.map((point) => ({
                      user_id: user.id,
                      interest_id: interest.id,
                      source,
                      content: point,
                    }))
                  );
                if (!memError) memoriesAdded = points.length;
              }
            } catch {
              // Memory is best-effort — a failed extraction shouldn't fail the fetch.
            }

            const row = { ...base, ok: true as const, memoriesAdded };
            send({ type: "result", ...row });
            return row;
          } catch (err) {
            const row = {
              ...base,
              ok: false as const,
              error: err instanceof Error ? err.message : "Unknown error",
            };
            send({ type: "result", ...row });
            return row;
          }
        })
      );

      send({ type: "done", results });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
