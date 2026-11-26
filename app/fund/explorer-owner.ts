import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { fundAuthenticatorDatabaseAllowed, fundAuthenticatorPilotOwner } from "./authenticator-config";

export async function resolveExplorerFundOwner(request: NextRequest, db: SupabaseClient) {
  if (!fundAuthenticatorDatabaseAllowed()) return null;

  const token = request.cookies.get("__Host-ussd-fund-session")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;

  const { data, error } = await db.from("fund_authenticator_sessions").select("terminal_user_id")
    .eq("token_hash", createHash("sha256").update(token).digest("hex"))
    .gt("expires_at", new Date().toISOString()).maybeSingle();

  if (error) throw error;
  const owner = data?.terminal_user_id;
  if (typeof owner !== "string") return null;
  if (owner === fundAuthenticatorPilotOwner() || process.env.FLATVERSE_EXPLORER_ENROLLMENT === "true") return owner;
  return null;
}

export function isExplorerFundActionOrigin(request: NextRequest) {
  const origin = process.env.FUND_AUTHENTICATOR_ORIGIN;
  return Boolean(origin) && request.headers.get("origin") === origin;
}
