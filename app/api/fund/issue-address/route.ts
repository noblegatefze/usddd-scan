import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash, createCipheriv } from "crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

// AES-256-GCM encrypt using FUND_KEY_ENC_SECRET (server-only)
function encryptPrivKeyHex(privKeyHex: `0x${string}`, secret: string): string {
  const key = createHash("sha256").update(secret, "utf8").digest(); // 32 bytes
  const iv = randomBytes(12); // GCM recommended 12 bytes
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(privKeyHex, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // pack as base64: iv.tag.ciphertext
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

function makePositionRef(): string {
  // short human-friendly ref
  const b = randomBytes(4).toString("hex").toUpperCase(); // 8 chars
  return `FN-${b}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = env("SUPABASE_URL");
    const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const min = Number(env("FUND_MIN_USDT"));
    const max = Number(env("FUND_MAX_USDT"));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min >= max) {
      throw new Error("Invalid FUND_MIN_USDT / FUND_MAX_USDT");
    }

    const encSecret = env("FUND_KEY_ENC_SECRET");

    const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    // Maintenance gate (DB-authoritative)
    const { data: flags, error: flagsErr } = await sb.rpc("rpc_admin_flags");
    if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    const row: any = Array.isArray(flags) ? flags[0] : flags;
    if (row && (row.pause_all || row.pause_reserve)) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    }


    let terminalUserId: string | undefined;
    if (process.env.FUND_REQUIRE_AUTHENTICATOR === "true") {
      const origin = process.env.FUND_AUTHENTICATOR_ORIGIN;
      if (!origin || req.headers.get("origin") !== origin) {
        return NextResponse.json({ ok: false, error: "Open the official Fund Network page." }, { status: 403 });
      }
      const token = req.cookies.get("__Host-ussd-fund-session")?.value;
      if (!token || !/^[0-9a-f]{64}$/.test(token)) {
        return NextResponse.json({ ok: false, error: "Set up or sign in with Fund Authenticator first." }, { status: 401 });
      }
      const { data: session, error: sessionError } = await sb.from("fund_authenticator_sessions")
        .select("terminal_user_id").eq("token_hash", createHash("sha256").update(token).digest("hex"))
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (sessionError) return NextResponse.json({ ok: false, error: "Fund sign-in is unavailable." }, { status: 503 });
      if (!session) return NextResponse.json({ ok: false, error: "Sign in to Fund Network again." }, { status: 401 });
      terminalUserId = session.terminal_user_id;
    }

    // Generate dedicated EOA deposit address for this position
    const priv = generatePrivateKey();
    const acct = privateKeyToAccount(priv);
    const depositAddress = acct.address.toLowerCase();

    const positionRef = makePositionRef();

    // Insert position
    const { data: pos, error: posErr } = await sb
      .from("fund_positions")
      .insert({
        position_ref: positionRef,
        issued_deposit_address: depositAddress,
        chain: "bsc",
        token: "usdt",
        expected_min_usdt: min,
        expected_max_usdt: max,
        status: "awaiting_funds",
        locked: true,
        ...(terminalUserId ? { terminal_user_id: terminalUserId } : {}),
      })
      .select("id, position_ref, issued_deposit_address, chain, token, expected_min_usdt, expected_max_usdt, status, created_at")
      .single();

    if (posErr) throw posErr;
    if (!pos?.id) throw new Error("Failed to create position");

    // Store encrypted private key (never return)
    const enc = encryptPrivKeyHex(priv, encSecret);

    const { error: keyErr } = await sb.from("fund_deposit_keys").insert({
      position_id: pos.id,
      enc_privkey: enc,
    });

    if (keyErr) throw keyErr;

    return NextResponse.json({
      ok: true,
      position: {
        id: pos.id,
        ref: pos.position_ref,
        deposit_address: pos.issued_deposit_address,
        chain: pos.chain,
        token: pos.token,
        min_usdt: Number(pos.expected_min_usdt),
        max_usdt: Number(pos.expected_max_usdt),
        status: pos.status,
        created_at: pos.created_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to issue address" },
      { status: 400 }
    );
  }
}
