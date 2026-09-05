/**
 * Who counts as an admin. There is one admin account today, so the list lives
 * in code rather than in a column on profiles — a schema change can wait until
 * admins are something the app grants rather than something it ships with.
 */
const ADMIN_EMAILS = ["edwinang.email@gmail.com"];

/** True when the signed-in user is an admin. Email match is case-insensitive. */
export function isAdmin(
  user: { email?: string | null } | null | undefined,
): boolean {
  const email = user?.email?.trim().toLowerCase();
  return email ? ADMIN_EMAILS.includes(email) : false;
}
