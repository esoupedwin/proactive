/**
 * A `next=` destination we are willing to redirect to after sign-in: a path
 * inside this app, never another site. Anything else falls back to the root,
 * which resolves to the reader's home briefing.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  // "//host" and "/\host" are protocol-relative — a browser reads them as
  // another origin, which would make this an open redirect.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
