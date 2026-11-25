export function fundAuthenticatorDatabaseAllowed() {
  if (process.env.VERCEL_ENV !== "preview") return true;
  const configured = process.env.SUPABASE_URL;
  const isolated = process.env.FUND_AUTHENTICATOR_PREVIEW_DB_ORIGIN;
  if (!configured || !isolated) return false;
  try {
    const actual = new URL(configured);
    return actual.protocol === "https:" &&
      actual.origin === new URL(isolated).origin &&
      actual.hostname !== "cojmhyythdyjxxrljvvx.supabase.co";
  } catch {
    return false;
  }
}
