"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

type BuildMeta = { version: string; build: string; deployed_at: string };

type ActivityModel = {
  reward_efficiency_usd_per_usddd?: number;
  accrual_floor_pct?: number;
  accrual_cap_pct?: number;
  applied_accrual_pct?: number;
};

type ActivityResp = {
  window?: { start: string; end: string; hours: number };
  money?: { claims_value_usd: number; usddd_spent: number };
  model?: ActivityModel;
};

type IssuedPosition = {
  id: string;
  ref: string;
  deposit_address: string;
  chain: string;
  token: string;
  min_usdt: number;
  max_usdt: number;
  status: string;
  created_at: string;

  deposit_tx_hash?: string | null;
  funded_usdt?: number | null;
  funded_at?: string | null;
};

type DbPosition = {
  id: string;
  position_ref: string;
  issued_deposit_address: string;
  status: string;
  created_at: string;

  deposit_tx_hash?: string | null;
  funded_usdt?: number | string | null;
  funded_at?: string | null;

  gas_topup_tx_hash?: string | null;
  gas_topup_bnb?: number | string | null;
  gas_topup_at?: string | null;

  sweep_tx_hash?: string | null;
  swept_at?: string | null;

  usddd_allocated?: number | string | null;
  usddd_accrued_display?: number | string | null;

  terminal_user_id?: string | null;
};

const LINKS = {
  home: "/",
  terminal: "https://digdug.do",
  telegram: "https://t.me/digdugdo",
  docs: "https://github.com/noblegatefze/digdug-whitepaper",
};

const BSC_SCAN_BASE = "https://bscscan.com";
const USDDD_TOKEN_BEP20 = "0x03f65216F340bAC39c8d1911288B1c7CA071e9c3";

const LOCAL_REFS_KEY = "usddd_fund_refs_v1";
const LOCAL_SESSION_KEY = "usddd_terminal_session_id_v1";
const LOCAL_DISMISSED_KEY = "usddd_dismissed_positions_v1";

function fmtPct2(n: number) {
  return `${n.toFixed(2)}%`;
}
function fmtNum(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}
function fmtDec(n: number, dp = 4) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: dp }).format(n);
}

function msUntilNextUtcReset(now = new Date()): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const next = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return Math.max(0, next.getTime() - now.getTime());
}
function formatHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const rem = total % 3600;
  const min = Math.floor(rem / 60);
  const sec = rem % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function GoldenPulsePills({ className = "" }: { className?: string }) {
  const [utcResetTxt, setUtcResetTxt] = React.useState<string>("—");

  React.useEffect(() => {
    const tick = () => setUtcResetTxt(formatHMS(msUntilNextUtcReset()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
        UTC reset: {utcResetTxt}
      </span>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 900);
        } catch {
          // ignore
        }
      }}
      className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
      title="Copy"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function coerceMeta(j: any): BuildMeta | null {
  if (!j || typeof j !== "object") return null;
  if (j.meta && typeof j.meta === "object") {
    const m = j.meta;
    if (typeof m.version === "string" && typeof m.build === "string") return m as BuildMeta;
  }
  if (typeof j.version === "string" && typeof j.build === "string") return j as BuildMeta;
  return null;
}

function coerceActivity(j: any): ActivityResp | null {
  if (!j || typeof j !== "object") return null;
  if (j.ok === true) {
    const { ok, ...rest } = j;
    return rest as ActivityResp;
  }
  if (j.window || j.money || j.model) return j as ActivityResp;
  return null;
}

function readDismissedRefs(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_DISMISSED_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}
function saveDismissedRefs(refs: string[]) {
  try {
    const uniq = Array.from(new Set(refs.map((r) => r.trim()).filter(Boolean)));
    localStorage.setItem(LOCAL_DISMISSED_KEY, JSON.stringify(uniq));
  } catch { }
}

function readSavedRefs(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_REFS_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}
function saveRefs(refs: string[]) {
  try {
    const uniq = Array.from(new Set(refs.map((r) => r.trim()).filter(Boolean)));
    localStorage.setItem(LOCAL_REFS_KEY, JSON.stringify(uniq));
  } catch { }
}

function readSessionId(): string {
  try {
    return (localStorage.getItem(LOCAL_SESSION_KEY) ?? "").trim();
  } catch {
    return "";
  }
}
function saveSessionId(v: string) {
  try {
    if (!v.trim()) localStorage.removeItem(LOCAL_SESSION_KEY);
    else localStorage.setItem(LOCAL_SESSION_KEY, v.trim());
  } catch { }
}

function statusToStage(status: string) {
  const s = String(status || "");

  if (s === "awaiting_funds") {
    return {
      title: "Awaiting",
      hint: "Send USDT (BEP-20) to your unique deposit address, then confirm with your tx hash.",
    };
  }

  if (s === "funded_locked") {
    return {
      title: "Funded",
      hint: "Deposit verified. Next: sweep to the treasury pipe (automatic).",
    };
  }

  if (s === "swept_locked") {
    return {
      title: "Swept",
      hint: "USDT is in the treasury pipe. Allocation remains protocol-locked (custody).",
    };
  }

  return { title: s || "Unknown", hint: "Status reported by protocol." };
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`${BSC_SCAN_BASE}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[11px] text-slate-200 hover:underline"
      title={hash}
    >
      {hash.slice(0, 10)}…{hash.slice(-6)}
    </a>
  );
}

export default function FundNetworkPage() {
  const [meta, setMeta] = React.useState<BuildMeta | null>(null);
  const [activity, setActivity] = React.useState<ActivityResp | null>(null);

  const [ack, setAck] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  const [issueErr, setIssueErr] = React.useState<string | null>(null);

  const [hideAwaiting, setHideAwaiting] = React.useState(true);
  const [dismissedRefs, setDismissedRefs] = React.useState<string[]>([]);
  const [dismissModal, setDismissModal] = React.useState<{ open: boolean; ref: string }>({ open: false, ref: "" });

  // local receipts (immediate UX)
  const [positions, setPositions] = React.useState<IssuedPosition[]>([]);
  // db truth
  const [dbPositions, setDbPositions] = React.useState<DbPosition[]>([]);
  const [loadingDb, setLoadingDb] = React.useState(false);

  const [fundSummary, setFundSummary] = React.useState<{
    pending_positions: number;
    active_positions: number;
    total_funded_usdt: number;
  } | null>(null);

  // Terminal session binding
  const [sessionId, setSessionId] = React.useState<string>("");
  const [bindErr, setBindErr] = React.useState<string | null>(null);
  const [binding, setBinding] = React.useState(false);
  const [bound, setBound] = React.useState(false);

  // Confirm deposit
  const [confirming, setConfirming] = React.useState<Record<string, boolean>>({});
  const [txInputs, setTxInputs] = React.useState<Record<string, string>>({});
  const [confirmErr, setConfirmErr] = React.useState<Record<string, string>>({});

  // Confirm modal (UX)
  const [confirmModal, setConfirmModal] = React.useState<{
    open: boolean;
    ref: string;
    tx: string;
    stage: "idle" | "verifying" | "sweeping" | "success" | "error";
    message?: string;
    tries: number;
    major: boolean;
  }>({ open: false, ref: "", tx: "", stage: "idle", tries: 0, major: false });

  async function hydrateDbByRefsOrSession() {
    const sid = sessionId.trim();
    const refs = readSavedRefs();

    setLoadingDb(true);
    try {
      const body: any = sid ? { session_id: sid } : { refs };
      const r = await fetch("/api/fund/positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const j: any = await r.json();
      if (j?.ok && Array.isArray(j.positions)) {
        const arr = (j.positions as DbPosition[]).slice().sort((a, b) => {
          const ta = Date.parse(String(a.created_at || ""));
          const tb = Date.parse(String(b.created_at || ""));
          return (isFinite(tb) ? tb : 0) - (isFinite(ta) ? ta : 0);
        });
        setDbPositions(arr);
        setBound(Boolean(sid) && j.mode === "terminal_user");
      }
    } catch {
      // ignore
    } finally {
      setLoadingDb(false);
    }
  }

  // initial load: session id + db hydrate
  React.useEffect(() => {
    setSessionId(readSessionId());
    setDismissedRefs(readDismissedRefs());
    void hydrateDbByRefsOrSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll fund summary
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/fund/summary", { cache: "no-store" });
        const j: any = await r.json();
        if (!cancelled && j?.ok) {
          setFundSummary({
            pending_positions: Number(j.pending_positions ?? 0),
            active_positions: Number(j.active_positions ?? 0),
            total_funded_usdt: Number(j.total_funded_usdt ?? 0),
          });
        }
      } catch { }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Auto-refresh DB positions (seamless)
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await hydrateDbByRefsOrSession();
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // meta + activity
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/meta/build", { cache: "no-store" });
        const j: any = await r.json();
        const m = coerceMeta(j);
        if (!cancelled && m) setMeta(m);
      } catch { }
    })();

    (async () => {
      try {
        const r = await fetch("/api/activity/24h", { cache: "no-store" });
        const j: any = await r.json();
        const a = coerceActivity(j);
        if (!cancelled && a) setActivity(a);
      } catch { }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const model = activity?.model ?? {};
  const appliedAccrualPct = typeof model.applied_accrual_pct === "number" ? model.applied_accrual_pct : null;
  const floorPct = typeof model.accrual_floor_pct === "number" ? model.accrual_floor_pct : 10;
  const capPct = typeof model.accrual_cap_pct === "number" ? model.accrual_cap_pct : 25;
  const rewardEff = typeof model.reward_efficiency_usd_per_usddd === "number" ? model.reward_efficiency_usd_per_usddd : null;

  const yourTotalUsdt = dbPositions.reduce((acc, p) => {
    const v = Number(p.funded_usdt ?? 0);
    return Number.isFinite(v) ? acc + v : acc;
  }, 0);

  const yourTotalAllocated = dbPositions.reduce((acc, p) => {
    const v = Number(p.usddd_allocated ?? 0);
    return Number.isFinite(v) ? acc + v : acc;
  }, 0);

  const dismissedSet = React.useMemo(() => new Set(dismissedRefs), [dismissedRefs]);

  const visibleDbPositions = React.useMemo(() => {
    return dbPositions.filter((p) => {
      if (dismissedSet.has(p.position_ref)) return false;
      if (hideAwaiting && String(p.status) === "awaiting_funds") return false;
      return true;
    });
  }, [dbPositions, dismissedSet, hideAwaiting]);

  async function issueNewPosition() {
    if (!ack) return;
    setIssueErr(null);
    setIssuing(true);
    try {
      const r = await fetch("/api/fund/issue-address", { method: "POST" });
      const j: any = await r.json();
      if (!r.ok || !j?.ok) {
        setIssueErr(j?.error ?? "Failed to generate deposit address");
        return;
      }
      const p = j.position as IssuedPosition;
      setPositions((prev) => [p, ...prev]);

      const refs = Array.from(new Set([...readSavedRefs(), p.ref]));
      saveRefs(refs);
      void hydrateDbByRefsOrSession();

      setTimeout(() => {
        const el = document.getElementById("receipts");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (e: any) {
      setIssueErr(e?.message ?? "Failed to generate deposit address");
    } finally {
      setIssuing(false);
    }
  }

  async function bindToTerminal() {
    const sid = sessionId.trim();
    setBindErr(null);
    if (!sid) {
      setBindErr("Enter your Terminal session_id (from your Terminal browser cookie / session).");
      return;
    }
    setBinding(true);
    try {
      const refs = readSavedRefs();
      if (refs.length === 0) {
        setBindErr("No saved refs in this browser yet. Generate a position first.");
        return;
      }

      const r = await fetch("/api/fund/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sid, refs }),
        cache: "no-store",
      });
      const j: any = await r.json();
      if (!j?.ok) {
        setBindErr(j?.error ?? "Bind failed");
        return;
      }
      saveSessionId(sid);
      setBound(true);
      await hydrateDbByRefsOrSession();
    } catch (e: any) {
      setBindErr(e?.message ?? "Bind failed");
    } finally {
      setBinding(false);
    }
  }

  function isMajorConfirmError(msg: string) {
    const m = msg.toLowerCase();
    return (
      m.includes("amount out of bounds") ||
      m.includes("no matching usdt transfer") ||
      m.includes("send only usdt") ||
      m.includes("wrong token") ||
      m.includes("wrong chain")
    );
  }

  function mailtoRecovery(ref: string, tx: string) {
    const to = "hq@noblegate.ae";
    const subject = encodeURIComponent(`USDDD Fund Recovery Request — ${ref}`);
    const body = encodeURIComponent(
      `Hello HQ,\n\nI need help recovering a deposit sent to a USDDD Fund Network address.\n\nRef: ${ref}\nTx hash: ${tx}\nSession id (if available): ${sessionId.trim()}\n\nNotes:\n- I may have used the wrong token/chain or made an incorrect transfer.\n- Please advise the recovery process.\n\nThank you.`
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  async function confirmDeposit(ref: string) {
    const tx = (txInputs[ref] ?? "").trim();
    if (!tx) {
      setConfirmErr((prev) => ({ ...prev, [ref]: "Enter tx hash" }));
      return;
    }

    // open modal
    setConfirmModal((prev) => ({
      open: true,
      ref,
      tx,
      stage: "verifying",
      message: "Verifying deposit…",
      tries: (prev.ref === ref ? prev.tries : 0) + 1,
      major: false,
    }));

    setConfirmErr((prev) => ({ ...prev, [ref]: "" }));
    setConfirming((prev) => ({ ...prev, [ref]: true }));

    try {
      const r = await fetch("/api/fund/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref, tx_hash: tx, session_id: sessionId.trim() || null }),
        cache: "no-store",
      });

      const j: any = await r.json().catch(() => ({}));

      if (!j?.ok) {
        const msg = String(j?.error ?? "Confirm failed");
        const major = isMajorConfirmError(msg);

        setConfirmErr((prev) => ({ ...prev, [ref]: msg }));

        setConfirmModal((prev) => ({
          ...prev,
          open: true,
          stage: "error",
          message: msg,
          major: major || prev.tries >= 2, // escalate after 2 tries
        }));

        return;
      }

      // If confirm ok but sweep failed, show it as "sweeping" then error
      if (j?.sweep && j.sweep.ok === false) {
        const msg = String(j?.sweep?.error ?? "Sweep failed (try again shortly)");
        setConfirmModal((prev) => ({
          ...prev,
          stage: "error",
          message: `Deposit confirmed, but sweep is pending: ${msg}`,
          major: false,
        }));
        // still refresh DB so user sees funded_locked row if it exists
        await hydrateDbByRefsOrSession();
        return;
      }

      // Success
      setConfirmModal((prev) => ({
        ...prev,
        stage: "success",
        message: "Position added ✅",
        major: false,
      }));

      await hydrateDbByRefsOrSession();

      // UX: clear receipt after success + show row
      setPositions((prev) => prev.filter((p) => p.ref !== ref));
      setTxInputs((prev) => ({ ...prev, [ref]: "" }));

      setTimeout(() => {
        const el = document.getElementById("positions");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);

      // Hold modal for 900ms then close
      setTimeout(() => {
        setConfirmModal((prev) => ({ ...prev, open: false, stage: "idle", message: undefined }));
      }, 900);
    } catch (e: any) {
      const msg = String(e?.message ?? "Confirm failed");
      const major = isMajorConfirmError(msg);

      setConfirmErr((prev) => ({ ...prev, [ref]: msg }));
      setConfirmModal((prev) => ({
        ...prev,
        open: true,
        stage: "error",
        message: msg,
        major: major || prev.tries >= 2,
      }));
    } finally {
      setConfirming((prev) => ({ ...prev, [ref]: false }));
    }
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#0b0f14] text-slate-200">
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-[#0b0f14]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="relative h-7 w-7 overflow-hidden rounded-full border border-slate-800 bg-slate-950/40">
              <Image src="/logo.png" alt="USDDD" fill sizes="28px" className="object-cover" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">USDDD Scan</div>
              <div className="text-[11px] text-slate-400">powered by DIGDUG.DO</div>
            </div>
          </div>

          <div className="hidden lg:flex flex-1 justify-center">
            <div className="w-[520px] rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[13px] text-slate-300">
              Fund Network - private funding console...
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
              Zero / Pre-Genesis
            </span>
            <span className="rounded-full border border-emerald-900/60 bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-300">
              LIVE
            </span>
          </div>
        </div>

        <div className="border-t border-slate-800/40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[12px] text-slate-400">
            <span>Phase: Zero</span>
            <span className="text-slate-600">·</span>
            <span>Version: {meta?.version ?? "—"}</span>
            <span className="text-slate-600">·</span>
            <span>Build: {meta?.build ?? "—"}</span>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Link
                href={LINKS.home}
                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
              >
                Back to Scan
              </Link>
              <a
                href={LINKS.terminal}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
              >
                Open Terminal
              </a>
              <a
                href={LINKS.telegram}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
              >
                Telegram
              </a>
              <a
                href={LINKS.docs}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
              >
                Docs
              </a>
            </div>
          </div>
        </div>

        <div className="lg:hidden border-t border-slate-800/40 px-4 py-2">
          <div className="w-full rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[13px] text-slate-300">
            Fund Network - private funding console...
          </div>
          <div className="mt-2 flex justify-between">
            <GoldenPulsePills />
          </div>
        </div>
      </header>

      {confirmModal.open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <div className="relative w-[92%] max-w-lg rounded-xl border border-slate-800/70 bg-[#0b0f14]/95 p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Confirm deposit</div>
                <div className="mt-1 text-[12px] text-slate-400">
                  Ref: <span className="font-mono text-slate-200">{confirmModal.ref}</span>
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  Tx:{" "}
                  <span className="font-mono text-slate-200">
                    {confirmModal.tx.slice(0, 10)}…{confirmModal.tx.slice(-6)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConfirmModal((p) => ({ ...p, open: false }))}
                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
                title="Close"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
              <div className="text-[12px] text-slate-400">Status</div>
              <div className="mt-1 text-[13px] text-slate-200">
                {confirmModal.message ?? (confirmModal.stage === "verifying" ? "Verifying deposit…" : "Working…")}
              </div>

              {confirmModal.stage === "verifying" || confirmModal.stage === "sweeping" ? (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950/50">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-slate-200/30" />
                </div>
              ) : null}

              {confirmModal.stage === "error" ? (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] text-slate-500">
                    If you entered the wrong tx hash, close this window, correct it, and confirm again.
                  </div>

                  {confirmModal.major ? (
                    <div className="rounded-md border border-amber-900/40 bg-amber-950/20 p-3 text-[12px] text-amber-200">
                      <div className="font-semibold text-amber-200/90">Recovery may be required</div>
                      <div className="mt-1 text-[11px] text-amber-200/90">
                        This can happen if the wrong token/chain was used, or the amount was outside the allowed range.
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => mailtoRecovery(confirmModal.ref, confirmModal.tx)}
                          className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[12px] text-amber-100 hover:bg-amber-950/50"
                        >
                          Request recovery (email HQ)
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmModal((p) => ({ ...p, open: false }))}
                          className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70"
                        >
                          Edit tx hash
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmModal((p) => ({ ...p, open: false }))}
                        className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70"
                      >
                        Edit tx hash
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {confirmModal.stage === "success" ? (
              <div className="mt-3 text-[11px] text-slate-500">Returning to your positions…</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {dismissModal.open ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[92%] max-w-md rounded-xl border border-slate-800/70 bg-[#0b0f14]/95 p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-100">Dismiss this position?</div>
            <div className="mt-2 text-[12px] text-slate-400">
              Ref: <span className="font-mono text-slate-200">{dismissModal.ref}</span>
            </div>

            <div className="mt-3 rounded-md border border-slate-800/60 bg-slate-950/30 p-3 text-[12px] text-slate-400">
              This will hide the position from this device.
              <div className="mt-2 text-[11px] text-slate-500">
                If you already sent funds to this address, do not dismiss — use Request recovery instead.
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDismissModal({ open: false, ref: "" })}
                className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  const ref = dismissModal.ref;
                  setDismissedRefs((prev) => {
                    const next = Array.from(new Set([...prev, ref]));
                    saveDismissedRefs(next);
                    return next;
                  });
                  setDismissModal({ open: false, ref: "" });
                }}
                className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[12px] text-amber-100 hover:bg-amber-950/50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 pt-6 pb-24">
        <div className="grid gap-4 md:grid-cols-12">
          <section className="md:col-span-7 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3">
              <h1 className="text-base font-semibold text-slate-100">Fund Network</h1>
              <div className="mt-1 text-[12px] text-slate-400 break-words">
                Create a dedicated deposit address, fund the network with USDT (BEP-20), and receive a custodied USDDD
                allocation tied to the protocol.
              </div>
            </div>

            <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-slate-200"
                />
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-slate-200">Understanding</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-slate-400 break-words">
                    <li>Each funding position uses a unique deposit address. Do not reuse old addresses.</li>
                    <li>Send only USDT on BNB Chain (BEP-20). Other tokens/chains may be unrecoverable.</li>
                    <li>For safety, deposits are confirmed by your tx hash (receipt-verified). Do not rely on automated scanning.</li>
                    <li>Withdrawals remain locked until admin unlock.</li>
                  </ul>

                  <div className="mt-3 rounded-md border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-[12px] text-slate-300">
                    <div className="font-semibold text-slate-200">Link to Terminal (recommended)</div>
                    <div className="mt-1 text-slate-400">
                      To permanently access positions across devices, link this page to your DIGDUG Terminal session (no
                      password required here).
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        value={sessionId}
                        onChange={(e) => {
                          setSessionId(e.target.value);
                          saveSessionId(e.target.value);
                        }}
                        placeholder="Terminal session_id"
                        className="w-full md:w-[420px] rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-[12px] text-slate-200 placeholder:text-slate-600"
                      />
                      <button
                        type="button"
                        onClick={bindToTerminal}
                        disabled={binding}
                        className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70 disabled:opacity-60"
                      >
                        {binding ? "Linking..." : bound ? "Linked" : "Link Terminal"}
                      </button>

                      <a
                        href={LINKS.terminal}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70"
                      >
                        Open Terminal
                      </a>
                    </div>

                    {bindErr && <div className="mt-2 text-[12px] text-amber-200">{bindErr}</div>}
                    <div className="mt-2 text-[11px] text-slate-500">
                      Tip: open Terminal in a separate tab, log in, then copy your current session_id (we&apos;ll add a UI
                      button later).
                    </div>
                  </div>

                  <div className="mt-3 text-[12px] text-slate-500">
                    By continuing, you confirm you understand the protocol terms above.
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {ack ? (
                <>
                  <button
                    type="button"
                    onClick={issueNewPosition}
                    disabled={issuing || positions.length > 0}
                    title={positions.length > 0 ? "Finish or dismiss your current receipt first." : "Generate a unique deposit address"}
                    className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70 disabled:opacity-60"
                  >
                    {issuing ? "Generating..." : "Generate Deposit Address & Fund Network"}
                  </button>

                  <button
                    type="button"
                    disabled
                    className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-400 opacity-70 cursor-not-allowed"
                    title="Locked until admin unlock"
                  >
                    Withdraw (Locked)
                  </button>
                </>
              ) : (
                <div className="text-[12px] text-slate-500">
                  Tick <span className="text-slate-300">Understanding</span> to generate your unique deposit address.
                </div>
              )}
            </div>

            {issueErr && (
              <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-[12px] text-amber-200">
                <div className="font-semibold text-amber-200/90">Could not generate address</div>
                <div className="mt-1">{issueErr}</div>
              </div>
            )}

            <div className="mt-3 rounded-md border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-[12px] text-slate-400">
              <div className="font-semibold text-slate-200">Safety notes</div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Self-custody wallets are recommended. Exchange wallets may batch, split, or delay transfers.</li>
                <li>Save your Position Ref(s). This page stores refs locally in this browser unless linked to Terminal.</li>
                <li>Gas for sweep is handled automatically when needed.</li>
              </ul>
            </div>

            <div id="receipts" className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">Receipts (this browser session)</h2>
                <div className="text-[11px] text-slate-500">Newest first</div>
              </div>

              {positions.length === 0 ? (
                <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3 text-[12px] text-slate-400">
                  No positions generated yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {positions.map((p) => (
                    <div key={p.id} className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[12px] text-slate-400">
                          Position <span className="text-slate-200 font-semibold">{p.ref}</span>
                          <span className="mx-2 text-slate-600">·</span>
                          <span className="text-slate-500">{p.status}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">{new Date(p.created_at).toLocaleString()}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPositions((prev) => prev.filter((x) => x.ref !== p.ref))}
                          className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-950/70"
                          title="Removes this receipt from the screen (position ref remains saved)."
                        >
                          Dismiss
                        </button>
                        <span className="text-[11px] text-slate-600">Generate a new address after dismissing or confirming.</span>
                      </div>

                      <div className="mt-2 text-[12px] text-slate-400">Unique deposit address (USDT BEP-20)</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="flex-1 break-all rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-[12px] text-slate-200">
                          {p.deposit_address}
                        </code>
                        <CopyBtn text={p.deposit_address} />
                      </div>

                      <div className="mt-2 text-[12px] text-slate-500">
                        Min: <span className="text-slate-200">{fmtNum(p.min_usdt)} USDT</span>
                        <span className="mx-2 text-slate-600">·</span>
                        Max: <span className="text-slate-200">{fmtNum(p.max_usdt)} USDT</span>
                      </div>

                      <div className="mt-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-[12px] leading-relaxed text-red-300">
                        ⚠️ <strong>Important:</strong> Deposits must be sent in <strong>one single transfer</strong> between{" "}
                        <strong>100 and 250,000 USDT</strong>. Multiple smaller transfers are not aggregated.
                      </div>

                      <div className="mt-3 rounded-md border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-[12px]">
                        <div className="text-slate-300 font-semibold">Confirm deposit (tx hash)</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            value={txInputs[p.ref] ?? ""}
                            onChange={(e) => setTxInputs((prev) => ({ ...prev, [p.ref]: e.target.value }))}
                            placeholder="0x..."
                            className="w-full md:w-[520px] rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-[12px] text-slate-200 placeholder:text-slate-600"
                          />
                          <button
                            type="button"
                            onClick={() => confirmDeposit(p.ref)}
                            disabled={confirming[p.ref]}
                            className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70 disabled:opacity-60"
                          >
                            {confirming[p.ref] ? "Confirming..." : "Confirm"}
                          </button>
                        </div>
                        {confirmErr[p.ref] ? <div className="mt-2 text-[12px] text-amber-200">{confirmErr[p.ref]}</div> : null}
                      </div>

                      {p.deposit_tx_hash ? (
                        <div className="mt-2 text-[12px] text-slate-400">
                          Deposit tx: <TxLink hash={p.deposit_tx_hash} />
                        </div>
                      ) : (
                        <div className="mt-2 text-[12px] text-slate-500">Next: confirm your deposit by tx hash → locked.</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="md:col-span-5 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Accrual Reference</h2>
                <div className="mt-1 text-[12px] text-slate-400 break-words">Protocol-defined, observational.</div>
              </div>
              <div className="hidden md:flex">
                <GoldenPulsePills />
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
                <div className="text-[12px] text-slate-400">Applied Accrual (current reference)</div>
                <div className="mt-1 text-xl font-semibold text-slate-100">
                  {appliedAccrualPct == null ? "—" : fmtPct2(appliedAccrualPct)}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  Range: {fmtPct2(floorPct)}-{fmtPct2(capPct)}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
                <div className="text-[12px] text-slate-400">Reward Efficiency (driver)</div>
                <div className="mt-1 text-[12px] text-slate-200">{rewardEff == null ? "—" : `${fmtDec(rewardEff, 4)} $/USDDD`}</div>
              </div>

              <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
                <div className="text-[12px] text-slate-400">USDDD (custody token)</div>
                <div className="mt-1 text-[12px] text-slate-500">
                  Token:{" "}
                  <a href={`${BSC_SCAN_BASE}/token/${USDDD_TOKEN_BEP20}`} target="_blank" rel="noreferrer" className="text-slate-200 hover:underline">
                    {USDDD_TOKEN_BEP20.slice(0, 10)}…{USDDD_TOKEN_BEP20.slice(-6)}
                  </a>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
                <div className="text-[12px] text-slate-400">{bound ? "Your Totals (Terminal)" : "Your Totals (saved refs)"}</div>
                <div className="mt-2 grid gap-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-500">Positions</span>
                    <span className="text-slate-200">{dbPositions.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-500">USDT funded</span>
                    <span className="text-slate-200">{fmtNum(yourTotalUsdt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-500">USDDD allocated (custodied)</span>
                    <span className="text-slate-200">{fmtNum(yourTotalAllocated)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] text-slate-400">Protocol Backing (Global)</div>
                  <span className="rounded-full border border-slate-800 bg-slate-950/40 px-2 py-0.5 text-[10px] text-slate-400">
                    Protocol-wide
                  </span>
                </div>

                <div className="mt-1 text-[11px] text-slate-500">
                  These totals are protocol-wide (not your personal balance). Your totals are shown above.
                </div>

                <div className="mt-2 text-[12px] text-slate-500">
                  {fundSummary ? (
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-slate-500">Total funded (USDT)</span>
                        <span className="text-slate-200">{fmtNum(fundSummary.total_funded_usdt)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-slate-500">Active positions</span>
                        <span className="text-slate-200">{fundSummary.active_positions}</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-slate-500">Pending positions</span>
                        <span className="text-slate-200">{fundSummary.pending_positions}</span>
                      </div>
                    </div>
                  ) : (
                    <span>Loading…</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section id="positions" className="md:col-span-12 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-200">
                {bound ? "Positions (Terminal-linked)" : "Positions (saved refs)"}
              </h2>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHideAwaiting((v) => !v)}
                  className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
                  title="Hide or show unfunded (Awaiting) positions"
                >
                  {hideAwaiting ? "Hide Awaiting: ON" : "Hide Awaiting: OFF"}
                </button>

                <div className="text-[11px] text-slate-500">
                  {loadingDb ? "Refreshing…" : "Withdraw shown but locked"}
                </div>
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[860px] w-full text-[12px]">
                <thead className="text-slate-400">
                  <tr className="border-b border-slate-800/60">
                    <th className="py-2 pr-4 text-left font-medium">Ref</th>
                    <th className="py-2 pr-4 text-left font-medium">Deposit Address</th>
                    <th className="py-2 pr-4 text-right font-medium">Funded (USDT)</th>
                    <th className="py-2 pr-4 text-left font-medium">Deposit tx</th>
                    <th className="py-2 pr-4 text-left font-medium">Sweep tx</th>
                    <th className="py-2 pr-4 text-left font-medium">Gas topup</th>
                    <th className="py-2 pr-4 text-right font-medium">Allocated (USDDD)</th>
                    <th className="py-2 pr-4 text-right font-medium">Accrued (display)</th>
                    <th className="py-2 pr-2 text-left font-medium">Stage</th>
                    <th className="py-2 pl-2 text-right font-medium">Withdraw</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {visibleDbPositions.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={10}>
                        No positions yet.
                      </td>
                    </tr>
                  ) : (
                    visibleDbPositions.map((p) => {
                      const stage = statusToStage(p.status);
                      return (
                        <tr key={p.id} className="border-b border-slate-800/40 align-top">
                          <td className="py-2 pr-4">{p.position_ref}</td>
                          <td className="py-2 pr-4 font-mono break-all text-[11px] text-slate-300">
                            {p.issued_deposit_address.slice(0, 10)}…{p.issued_deposit_address.slice(-6)}
                          </td>
                          <td className="py-2 pr-4 text-right">{Number(p.funded_usdt ?? 0) ? fmtNum(Number(p.funded_usdt)) : "—"}</td>
                          <td className="py-2 pr-4">{p.deposit_tx_hash ? <TxLink hash={p.deposit_tx_hash} /> : <span className="text-slate-600">—</span>}</td>
                          <td className="py-2 pr-4">{p.sweep_tx_hash ? <TxLink hash={p.sweep_tx_hash} /> : <span className="text-slate-600">—</span>}</td>
                          <td className="py-2 pr-4">
                            {p.gas_topup_tx_hash ? (
                              <div className="text-[11px]">
                                <TxLink hash={p.gas_topup_tx_hash} />
                                <div className="text-slate-500">
                                  {Number(p.gas_topup_bnb ?? 0) ? `${fmtDec(Number(p.gas_topup_bnb), 6)} BNB` : ""}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right">{Number(p.usddd_allocated ?? 0) ? fmtNum(Number(p.usddd_allocated)) : "—"}</td>
                          <td className="py-2 pr-4 text-right">{Number(p.usddd_accrued_display ?? 0) ? fmtNum(Number(p.usddd_accrued_display)) : "—"}</td>
                          <td className="py-2 pr-2">
                            <div className="text-slate-200">{stage.title}</div>
                            <div className="text-[11px] text-slate-500">{stage.hint}</div>
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {String(p.status) === "awaiting_funds" && !p.deposit_tx_hash ? (
                                <button
                                  type="button"
                                  onClick={() => setDismissModal({ open: true, ref: p.position_ref })}
                                  className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
                                  title="Hide this unfunded position from your list"
                                >
                                  Dismiss
                                </button>
                              ) : null}

                              <button
                                type="button"
                                disabled
                                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-400 opacity-70 cursor-not-allowed"
                                title="Locked until admin unlock"
                              >
                                Locked
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
