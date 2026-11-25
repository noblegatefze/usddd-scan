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

export function fundAuthenticatorPilotOwner() {
  const owner = process.env.FUND_AUTHENTICATOR_PILOT_OWNER_ID;
  return owner && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(owner)
    ? owner.toLowerCase() : null;
}
