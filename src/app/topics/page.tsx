import { redirect } from "next/navigation";

/** /topics — alias for the root redirect (most recently viewed topic). */
export default function TopicsIndex() {
  redirect("/");
}
