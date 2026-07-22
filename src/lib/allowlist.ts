/**
 * Email allowlist. ALLOWED_EMAILS is a comma-separated list;
 * when unset or empty, everyone is allowed (open signup).
 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) return true;
  return Boolean(email) && allowed.includes(email!.toLowerCase());
}
