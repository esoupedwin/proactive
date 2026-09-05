import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CircleDollarSign,
  Flame,
  History,
  Scaling,
  ShieldCheck,
  User,
  type LucideIcon,
} from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { SettingsHeader } from "@/components/settings-header";
import { signOut } from "@/lib/actions";
import { isAdmin } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** One tile in the settings grid. */
interface SettingsTile {
  href: string;
  label: string;
  /** Announced instead of the two-line label, which reads oddly aloud. */
  description: string;
  Icon: LucideIcon;
}

const TILES: SettingsTile[] = [
  {
    href: "/settings/explanations",
    label: "Tell Me More History",
    description: "Every passage you highlighted, with the answer it got",
    Icon: History,
  },
  {
    href: "/settings/display",
    label: "Display Preferences",
    description: "How reading text appears",
    Icon: Scaling,
  },
  {
    href: "/settings/profile",
    label: "Profile Preferences",
    description: "Default detail level and your background",
    Icon: User,
  },
  {
    href: "/settings/topics",
    label: "Topic of Interest",
    description: "Add, pause, and manage your topics",
    Icon: Flame,
  },
  {
    href: "/settings/cost",
    label: "Cost",
    description: "Total LLM spend so far",
    Icon: CircleDollarSign,
  },
];

/** Appended to the grid for admin accounts only. */
const ADMIN_TILE: SettingsTile = {
  href: "/admin",
  label: "Admin",
  description: "Operator tools for admin accounts",
  Icon: ShieldCheck,
};

/** Profile & Settings — who you are, and a way into each settings page. */
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "display_name" | "avatar_url">>();

  const tiles = isAdmin(user) ? [...TILES, ADMIN_TILE] : TILES;

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="Profile & Settings"
        backHref="/"
        backLabel="Back to briefing"
      />

      <section aria-label="Profile" className="mb-8">
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt=""
              width={48}
              height={48}
              className="rounded-full border border-rule"
            />
          ) : (
            <div
              aria-hidden
              className="flex size-12 items-center justify-center rounded-full border border-rule bg-neutral-100 text-lg font-bold text-ink-faint"
            >
              {(profile?.display_name ?? user.email ?? "?")
                .charAt(0)
                .toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {profile?.display_name ?? user.email}
            </p>
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs text-ink-faint underline hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </section>

      <nav aria-label="Settings">
        <ul className="grid grid-cols-3 gap-x-4 gap-y-6">
          {tiles.map(({ href, label, description, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                title={description}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <span className="flex aspect-square w-full items-center justify-center rounded-xl border border-rule transition-colors group-hover:bg-neutral-50">
                  {/* LinkPending swaps in a spinner mid-navigation; sized to
                      the icon so the tile doesn't shift. */}
                  <LinkPending className="size-8">
                    <Icon className="size-8" strokeWidth={1.5} aria-hidden />
                  </LinkPending>
                </span>
                <span className="text-sm leading-snug">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
