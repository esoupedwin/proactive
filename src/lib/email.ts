import { createSupabaseAdminClient } from "./supabase/server";
import type { ReportSections, Topic } from "./types";

/**
 * Report-ready email notifications, sent via Resend's HTTP API (no SDK —
 * one fetch, same pattern as the OpenRouter client). Configure with:
 *
 *   RESEND_API_KEY  — resend.com/api-keys
 *   EMAIL_FROM      — verified sender; the default onboarding address may
 *                     only deliver to the Resend account owner's own email.
 *
 * Everything here is best-effort by contract: a notification must never
 * fail or delay the report that triggered it.
 */

const RESEND_URL = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Proactive <onboarding@resend.dev>";
}

/** Minimal HTML escaping for interpolated user/model text. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ReportEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * The notification body (pure, unit-testable): what landed, the one-line
 * take, and a link to the briefing. Deliberately short — the report is the
 * destination, the email is the doorbell.
 */
export function buildReportEmail(options: {
  topicTitle: string;
  topicId: string;
  summary: string | null;
  sections: ReportSections | null;
  siteUrl: string;
}): ReportEmail {
  const { topicTitle, topicId, summary, sections, siteUrl } = options;
  const link = `${siteUrl.replace(/\/$/, "")}/topics/${topicId}`;
  const verdict = sections?.verdict ?? null;
  const noChange = sections?.no_meaningful_change === true;

  const subject = noChange
    ? `Checked: ${topicTitle} — nothing meaningful changed`
    : `New report: ${topicTitle}`;

  const lines: string[] = [];
  if (verdict?.answer) {
    lines.push(
      `Verdict: ${verdict.answer} (${verdict.likelihood}, ${verdict.confidence} confidence)`,
    );
  }
  if (summary) lines.push(summary);
  if (lines.length === 0) {
    lines.push(
      noChange
        ? "Proactive checked and found nothing meaningful to add."
        : "A new briefing is ready.",
    );
  }

  const text = [`${topicTitle}`, "", ...lines, "", `Read it: ${link}`].join(
    "\n",
  );

  const html = [
    `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">`,
    `<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#767676">Proactive</p>`,
    `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(topicTitle)}</h1>`,
    ...lines.map(
      (line) =>
        `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#444">${escapeHtml(line)}</p>`,
    ),
    `<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fdfdfc;text-decoration:none;font-size:14px;font-weight:600;padding:10px 16px;border-radius:6px">Read the briefing</a></p>`,
    `<p style="margin:16px 0 0;font-size:12px;color:#767676">You get this because email alerts are on in Settings → Profile Preferences.</p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}

async function sendEmail(to: string, email: ReportEmail): Promise<void> {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Emails the topic's owner that a report just finished — if email is
 * configured AND their profile has notify_email on. Called from both
 * generation paths (manual and cron); never throws.
 */
export async function notifyReportReady(options: {
  topic: Topic;
  sections: ReportSections | null;
  summary: string | null;
}): Promise<void> {
  const { topic, sections, summary } = options;
  if (!emailConfigured()) return;

  try {
    const admin = createSupabaseAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("notify_email")
      .eq("id", topic.user_id)
      .maybeSingle<{ notify_email: boolean | null }>();
    // Missing column/row (migration pending) → stay silent rather than spam.
    if (profile?.notify_email !== true) return;

    const { data: userData, error } = await admin.auth.admin.getUserById(
      topic.user_id,
    );
    const to = userData?.user?.email;
    if (error || !to) return;

    const email = buildReportEmail({
      topicTitle: topic.title,
      topicId: topic.id,
      summary,
      sections,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    });
    await sendEmail(to, email);
  } catch (err) {
    console.error("report notification email failed", err);
  }
}
