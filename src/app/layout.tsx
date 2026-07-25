import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Proactive",
  description:
    "Stay continuously informed about the topics that matter to you.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** Body text weight from the signed-in user's Display preferences. */
async function getUserFontWeight(): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 400;
    const { data } = await supabase
      .from("profiles")
      .select("font_weight")
      .eq("id", user.id)
      .maybeSingle<{ font_weight: number }>();
    return data?.font_weight ?? 400;
  } catch {
    return 400;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const fontWeight = await getUserFontWeight();

  return (
    <html lang="en" className={lexend.variable}>
      <body className="bg-paper text-ink" style={{ fontWeight }}>
        {/* Mobile-first: the whole app renders in a phone-width column. */}
        <div className="mx-auto min-h-dvh w-full max-w-md border-rule bg-paper sm:border-x">
          {children}
        </div>
      </body>
    </html>
  );
}
