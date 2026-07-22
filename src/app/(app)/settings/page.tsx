import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const name =
    (user.user_metadata.full_name as string | undefined) ??
    (user.user_metadata.name as string | undefined) ??
    user.email ??
    "Account";
  const avatarUrl = user.user_metadata.avatar_url as string | undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Google avatar
          <img
            src={avatarUrl}
            alt=""
            width={56}
            height={56}
            className="rounded-full border border-foreground/15"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-foreground/20 text-lg font-semibold">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-medium">{name}</p>
          {user.email && (
            <p className="text-xs text-foreground/50">{user.email}</p>
          )}
          <SignOutButton />
        </div>
      </div>

      <div>
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground/60">
          Interests
        </h2>
        <div className="mt-3 flex flex-col items-start gap-2">
          <Link
            href="/settings/interests"
            className="rounded-lg border border-foreground/30 px-4 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            Manage List
          </Link>
          <Link
            href="/settings/interests?add=1"
            className="rounded-lg border border-foreground/30 px-4 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            Add Interest
          </Link>
        </div>
      </div>

      <div>
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground/60">
          Memory
        </h2>
        <p className="mt-1 text-xs text-foreground/50">
          Key points the assistant remembers from your fetches.
        </p>
        <div className="mt-3">
          <Link
            href="/settings/memory"
            className="rounded-lg border border-foreground/30 px-4 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            View Memory
          </Link>
        </div>
      </div>

      <div>
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground/60">
          Appearance
        </h2>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
