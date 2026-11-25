import { fundAuthenticatorDatabaseAllowed, fundAuthenticatorPilotOwner } from "../../../fund/authenticator-config";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const cookieName = "__Host-ussd-fund-session";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const sessionLifetime = 8 * 60 * 60;

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("hex");
const isToken = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

function setupKey(secret: Buffer) {
  let value = 0;
  let bits = 0;
  let result = "";
  for (const byte of secret) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  return result;
}

function seal(secret: Buffer, key: Buffer, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(owner));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function open(value: string, key: Buffer, owner: string) {
  const sealed = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}

function acceptedStep(secret: Buffer, code: unknown) {
  if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) return null;
  const step = Math.floor(Date.now() / 30000);
  for (const candidate of [step, step - 1, step + 1]) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(candidate));
    const digest = createHmac("sha1", secret).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const decimal = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
    if (timingSafeEqual(Buffer.from(decimal), Buffer.from(code))) return candidate;
  }
  return null;
}

function withSession(value: string) {
  const response = json({ ok: true });
  response.cookies.set(cookieName, value, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/",
    maxAge: value ? sessionLifetime : 0,
  });
  return response;
}

export async function POST(req: NextRequest) {
  if (!fundAuthenticatorDatabaseAllowed()) return json({ error: "Fund Authenticator Preview is not configured." }, 503);
  const pilotOwner = fundAuthenticatorPilotOwner();
  if (!pilotOwner) return json({ error: "Fund Authenticator pilot is unavailable." }, 503);
  const secretKey = process.env.FUND_AUTHENTICATOR_KEY ?? "";
  const origin = process.env.FUND_AUTHENTICATOR_ORIGIN;
  if (!/^[a-f0-9]{64}$/i.test(secretKey) || !origin) {
    return json({ error: "Fund Authenticator is unavailable." }, 503);
  }
  if (req.headers.get("origin") !== origin) return json({ error: "Open the official Fund sign-in page." }, 403);
  const key = Buffer.from(secretKey, "hex");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Invalid request." }, 400);
  const deny = () => json({ error: "Those details could not be verified." }, 401);
  const limited = () => json({ error: "Too many attempts. Try again in a few minutes." }, 429);
  try {
    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    async function allow(bucket: string, limit: number) {
      const { data, error } = await db.rpc("fund_authenticator_allow_attempt", {
        p_bucket: hash(bucket), p_limit: limit,
      });
      if (error) throw error;
      return data === true;
    }
    if (body.action === "signout") {
      const value = req.cookies.get(cookieName)?.value;
      if (isToken(value)) {
        const { error } = await db.from("fund_authenticator_sessions").delete().eq("token_hash", hash(value));
        if (error) throw error;
      }
      return withSession("");
    }

    const client = req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!await allow("client:" + client, 40)) return limited();
    if (body.action === "finish") {
      if (!isToken(body.challenge)) return deny();
      const challengeHash = hash(body.challenge);
      if (!await allow("enrollment:" + challengeHash, 5)) return limited();
      const { data: pending, error } = await db.from("fund_authenticator_enrollments")
        .select("terminal_user_id,encrypted_secret").eq("challenge_hash", challengeHash)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error) throw error;
      if (!pending || pending.terminal_user_id !== pilotOwner) return deny();
      const step = acceptedStep(open(pending.encrypted_secret, key, pending.terminal_user_id), body.code);
      if (step === null) return deny();
      const session = token();
      const { data, error: finishError } = await db.rpc("fund_finish_authenticator_enrollment", {
        p_challenge_hash: challengeHash, p_step: step, p_token_hash: hash(session),
      });
      if (finishError) throw finishError;
      return data ? withSession(session) : deny();
    }

    if (body.action !== "start" && body.action !== "login") return json({ error: "Invalid request." }, 400);
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!username || username.length > 100 || typeof body.pass !== "string" || !body.pass || body.pass.length > 256) return deny();
    if (!await allow("account:" + username.toLowerCase(), 8)) return limited();
    const { data: user, error: userError } = await db.from("dd_terminal_users")
      .select("id,pass_hash,twofa_enabled").eq("username", username).maybeSingle();
    if (userError) throw userError;
    if (!user || user.id !== pilotOwner || !isToken(user.pass_hash) ||
        !timingSafeEqual(Buffer.from(user.pass_hash, "hex"), Buffer.from(hash(body.pass), "hex"))) return deny();
    const { data: credential, error: credentialError } = await db.from("fund_authenticator_credentials")
      .select("encrypted_secret").eq("terminal_user_id", user.id).maybeSingle();
    if (credentialError) throw credentialError;
    if (body.action === "start") {
      if (credential) return json({ error: "Fund Authenticator is already set up. Sign in or contact support." }, 409);
      if (user.twofa_enabled) return json({ error: "Contact support to migrate your existing Terminal two-factor authentication." }, 409);
      const secret = randomBytes(20);
      const manualKey = setupKey(secret);
      const issuer = "DIGDUG.DO Fund Network";
      const label = encodeURIComponent(issuer + ":" + username);
      const uri = "otpauth://totp/" + label + "?" + new URLSearchParams({ secret: manualKey, issuer });
      const qrCode = await QRCode.toDataURL(uri, { width: 240 });
      const challenge = token();
      const { error } = await db.from("fund_authenticator_enrollments").insert({
        challenge_hash: hash(challenge), terminal_user_id: user.id,
        encrypted_secret: seal(secret, key, user.id),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      return json({ challenge, setupKey: manualKey, qrCode });
    }

    if (!credential) return deny();
    const step = acceptedStep(open(credential.encrypted_secret, key, user.id), body.code);
    if (step === null) return deny();
    const session = token();
    const { data, error } = await db.rpc("fund_consume_authenticator_code", {
      p_user: user.id, p_expected_secret: credential.encrypted_secret, p_step: step, p_token_hash: hash(session),
    });
    if (error) throw error;
    return data === true ? withSession(session) : deny();
  } catch {
    return json({ error: "Fund Authenticator is temporarily unavailable." }, 503);
  }
}
