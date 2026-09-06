import { redirect } from "next/navigation";

/**
 * Root — the front door is Home (the topic list), not wherever the user
 * happened to read last. /topics owns the signed-out and no-topics redirects
 * (login, onboarding), so this stays an unconditional hop.
 */
export default function Home() {
  redirect("/topics");
}
