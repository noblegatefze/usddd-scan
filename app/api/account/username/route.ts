import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fundAuthenticatorDatabaseAllowed } from "../../../fund/authenticator-config";

export const runtime = "nodejs";

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return json({ error: "Use 3–24 letters, numbers, or underscores." }, 400);
  }
  if (!fundAuthenticatorDatabaseAllowed()) {
    return json({ error: "Username checks are unavailable in this Preview." }, 503);
  }

  try {
    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const client = request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown";
    const bucket = createHash("sha256").update("username-availability:" + client).digest("hex");
    const { data: allowed, error: rateError } = await db.rpc("fund_authenticator_allow_attempt", {
      p_bucket: bucket, p_limit: 30,
    });
    if (rateError) throw rateError;
    if (!allowed) return json({ error: "Too many checks. Try again in a few minutes." }, 429);

    const { data, error } = await db.from("flatverse_usernames").select("username_key")
      .eq("username_key", username.toLowerCase()).maybeSingle();
    if (error) throw error;
    return json({ available: data === null });
  } catch {
    return json({ error: "Username checks are temporarily unavailable." }, 503);
  }
}
