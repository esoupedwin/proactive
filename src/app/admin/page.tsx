import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { SettingsHeader } from "@/components/settings-header";
import { isAdmin } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Admin — the shell for operator-only tools. No functions live here yet; the
 * page exists so the access check has somewhere to guard.
 */
export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // A 404 rather than a redirect: non-admins learn nothing about the page.
  if (!isAdmin(user)) notFound();

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="Admin"
        description="Operator tools, visible only to admin accounts."
      />

      <div className="rounded-md border border-rule px-4 py-3">
        <p className="text-sm font-medium">Signed in as admin</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          {user.email}
        </p>
      </div>

      <Link
        href="/admin/ledger"
        className="mt-4 flex items-center gap-3 rounded-md border border-rule px-4 py-3 hover:bg-neutral-50"
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
        >
          <LinkPending>
            <ReceiptText className="size-5" aria-hidden />
          </LinkPending>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">LLM Ledger</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">
            Every OpenAI call — when, what for, which model, tokens, and cost.
            Filter and sort; compare against the OpenAI dashboard.
          </span>
        </span>
      </Link>
    </main>
  );
}
