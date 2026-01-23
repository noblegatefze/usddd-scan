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

  // set by watcher once detected
  deposit_tx_hash?: string | null;
  funded_usdt?: number | null;
  funded_at?: string | null;
};

const LINKS = {
  home: "/",
  terminal: "https://digdug.do",
  telegram: "https://t.me/digdugdo",
  docs: "https://github.com/noblegatefze/digdug-whitepaper",
};

const BSC_SCAN_BASE = "https://bscscan.com";
const USDDD_TOKEN_BEP20 = "0x03f65216F340bAC39c8d1911288B1c7CA071e9c3";

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

export default function FundNetworkPage() {
  const [meta, setMeta] = React.useState<BuildMeta | null>(null);
  const [activity, setActivity] = React.useState<ActivityResp | null>(null);

  const [ack, setAck] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  const [issueErr, setIssueErr] = React.useState<string | null>(null);

  const [positions, setPositions] = React.useState<IssuedPosition[]>([]);

  const [fundSummary, setFundSummary] = React.useState<{ pending_positions: number; active_positions: number; total_funded_usdt: number } | null>(null);

// Poll fund summary (always, independent of positions)
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
    } catch {
      // ignore
    }
  };

  tick();
  const t = setInterval(tick, 10000);
  return () => {
    cancelled = true;
    clearInterval(t);
  };
}, []);
// Poll watcher for any positions that are still awaiting funds (and update receipts)
React.useEffect(() => {
  if (positions.length === 0) return;

  let cancelled = false;
  const tick = async () => {
    try {
      // check all positions without a tx hash yet (newest first)
      const pending = positions.filter((p) => !p.deposit_tx_hash);
      if (pending.length === 0) return;

      for (const p of pending.slice(0, 3)) {
        const res = await fetch(`/api/fund/watch?ref=${encodeURIComponent(p.ref)}`, { cache: "no-store" });
        const json: any = await res.json();
        if (cancelled) return;
        if (!json?.ok) continue;

        const upd = (json.updates ?? [])[0];
        if (upd?.deposit_tx_hash) {
          setPositions((prev) =>
            prev.map((x) =>
              x.id === upd.id
                ? {
                    ...x,
                    status: upd.status ?? x.status,
                    deposit_tx_hash: upd.deposit_tx_hash,
                    funded_usdt: typeof upd.funded_usdt === "number" ? upd.funded_usdt : Number(upd.funded_usdt),
                    funded_at: upd.funded_at ?? x.funded_at,
                  }
                : x
            )
          );
        }
      }
    } catch {
      // ignore transient watcher failures
    }
  };

  tick();
  const t = setInterval(tick, 6000);
  return () => {
    cancelled = true;
    clearInterval(t);
  };
}, [positions]);React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/meta/build", { cache: "no-store" });
        const j: any = await r.json();
        const m = coerceMeta(j);
        if (!cancelled && m) setMeta(m);
      } catch {}
    })();

    (async () => {
      try {
        const r = await fetch("/api/activity/24h", { cache: "no-store" });
        const j: any = await r.json();
        const a = coerceActivity(j);
        if (!cancelled && a) setActivity(a);
      } catch {}
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

  const yourTotalUsdt = 0;
  const yourTotalAllocated = 0;

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
            <span className="rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">Testnet</span>
            <span className="rounded-full border border-emerald-900/60 bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-300">LIVE</span>
          </div>
        </div>

        <div className="border-t border-slate-800/40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[12px] text-slate-400">
            <span>Phase: Zero</span>
            <span className="text-slate-600">·</span>
            <span>Version: {meta?.version ?? "—"}</span>
            <span className="text-slate-600">·</span>
            <span>Build: {meta?.build ?? "—"}</span>
            <span className="text-slate-600">·</span>
            <span>Updated</span>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Link href={LINKS.home} className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70">
                Back to Scan
              </Link>
              <a href={LINKS.terminal} target="_blank" rel="noreferrer" className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70">
                Open Terminal
              </a>
              <a href={LINKS.telegram} target="_blank" rel="noreferrer" className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70">
                Telegram
              </a>
              <a href={LINKS.docs} target="_blank" rel="noreferrer" className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70">
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

      <div className="mx-auto max-w-6xl px-4 pt-6 pb-24">
        <div className="grid gap-4 md:grid-cols-12">
          <section className="md:col-span-7 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3">
              <h1 className="text-base font-semibold text-slate-100">Fund Network</h1>
              <div className="mt-1 text-[12px] text-slate-400 break-words">
                Create a dedicated deposit address, fund the network with USDT (BEP-20), and receive a custodied USDDD allocation tied to the protocol.
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
                    <li>USDDD is minted to protocol custody and recorded as a custodied allocation (not sent to your wallet until unlock/withdraw).</li>
                    <li>Accrual is protocol-defined and shown as an observational reference. It is not a guarantee.</li>
                    <li>Withdrawals are locked until admin unlock.</li>
                  </ul>
                  <div className="mt-3 text-[12px] text-slate-500">By continuing, you confirm you understand the protocol terms above.</div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {ack ? (
                <>
                  <button
                    type="button"
                    onClick={issueNewPosition}
                    disabled={issuing}
                    className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70 disabled:opacity-60"
                  >
                    {issuing ? "Generating..." : "Generate Deposit Address & Fund Network"}
                  </button>

                  <button
                    type="button"
                    onClick={issueNewPosition}
                    disabled={issuing}
                    className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70 disabled:opacity-60"
                    title="Creates a separate new position (recommended)"
                  >
                    {issuing ? "Please wait..." : "Deposit More (New Position)"}
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

            <div id="receipts" className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">Receipts</h2>
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
                        ⚠️ <strong>Important:</strong> Deposits must be sent in <strong>one single transfer</strong> between
                        <strong> 100 and 250,000 USDT</strong>. Multiple smaller transfers (e.g. 10 + 90) are
                        <strong>not aggregated</strong> and will <strong>not</strong> be credited.
                      </div>

                      <div className="mt-2 text-[12px] text-slate-500">
                        Next: waiting for deposit detection → tx hash receipt → custodied allocation.
                      </div>
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
                <div className="mt-1 text-xl font-semibold text-slate-100">{appliedAccrualPct == null ? "—" : fmtPct2(appliedAccrualPct)}</div>
                <div className="mt-1 text-[12px] text-slate-500">Range: {fmtPct2(floorPct)}-{fmtPct2(capPct)}</div>
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
                <div className="text-[12px] text-slate-400">Your Totals (this session)</div>
                <div className="mt-2 grid gap-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-500">Positions</span>
                    <span className="text-slate-200">{positions.length}</span>
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
                <div className="text-[12px] text-slate-400">Network Backing</div>
                <div className="mt-1 text-[12px] text-slate-500">{fundSummary ? (
                  <div className="mt-2 grid gap-2">
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
                )}</div>
              </div>
            </div>
          </section>

          <section className="md:col-span-12 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Positions</h2>
              <div className="text-[11px] text-slate-500">Withdraw shown but locked</div>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[760px] w-full text-[12px]">
                <thead className="text-slate-400">
                  <tr className="border-b border-slate-800/60">
                    <th className="py-2 pr-4 text-left font-medium">Ref</th>
                    <th className="py-2 pr-4 text-left font-medium">Deposit Address</th>
                    <th className="py-2 pr-4 text-right font-medium">Funded (USDT)</th>
                    <th className="py-2 pr-4 text-right font-medium">Allocated (USDDD)</th>
                    <th className="py-2 pr-4 text-right font-medium">Accrued (display)</th>
                    <th className="py-2 pr-2 text-left font-medium">Status</th>
                    <th className="py-2 pl-2 text-right font-medium">Withdraw</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {positions.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={7}>
                        No positions yet.
                      </td>
                    </tr>
                  ) : (
                    positions.map((p) => (
                      <tr key={p.id} className="border-b border-slate-800/40">
                        <td className="py-2 pr-4">{p.ref}</td>
                        <td className="py-2 pr-4 font-mono break-all text-[11px] text-slate-300">
                          {p.deposit_address.slice(0, 10)}…{p.deposit_address.slice(-6)}
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-500">—</td>
                        <td className="py-2 pr-4 text-right text-slate-500">—</td>
                        <td className="py-2 pr-4 text-right text-slate-500">—</td>
                        <td className="py-2 pr-2 text-slate-400">{p.status}</td>
                        <td className="py-2 pl-2 text-right">
                          <button
                            type="button"
                            disabled
                            className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-400 opacity-70 cursor-not-allowed"
                            title="Locked until admin unlock"
                          >
                            Locked
                          </button>
                        </td>
                      </tr>
                    ))
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







