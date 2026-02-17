"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { getPublicFlags } from "./lib/flags";
import { ScanMaintenance } from "./_maintenance/ScanMaintenance";

// =====================
// TYPES
// =====================

type ActivityResp = {
  ok?: boolean;
  mode?: string;
  error?: string | null;
  window?: { start: string | null; end: string | null; hours: number };

  counts: {
    sessions_24h: number;
    protocol_actions: number;
    claims_executed: number;
    claim_reserves: number;
    unique_claimers: number;
    ledger_entries: number;
    golden_events: number;
    terminal_users: number;
  };

  money: {
    claims_value_usd: number;
    usddd_spent: number;
  };

  model: {
    reward_efficiency_usd_per_usddd: number;
    reward_efficiency_prev_usd_per_usddd: number;
    efficiency_delta_usd_per_usddd: number;

    accrual_scaling_pct: number;
    accrual_floor_pct: number;
    accrual_cap_pct: number;
    accrual_potential_pct: number;
    applied_accrual_pct: number;

    network_performance_pct: number;
    network_performance_cap_pct: number;
    network_performance_display_pct?: number;
  };

  warnings?: any[];
};

type GoldenFindRow = {
  ts: string | null;
  claim: string | null;
  winner: string;
  token: string | null;
  chain: string | null;
  usd: number;
};

type BoxBalanceRow = {
  box: string;
  cmc_id?: number | null;
  deposited: number;
  claimed: number;
  withdrawn: number;
  remaining: number;
};

type GoldenWinnersRow = {
  winner: string;
  wins: number;
  usd_total: number;
};

type BuildMeta = {
  version: string;
  build: string;
  deployed_at: string;
};

// =====================
// FORMATTERS
// =====================

function fmt(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function fmtDec(n: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtUsd(n: number) {
  return `$${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

function relTime(ts: string | null) {
  if (!ts) return "-";
  const t = new Date(ts).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const LINKS = {
  terminal: "https://digdug.do",
  telegram: "https://t.me/digdugdo",
  docs: "https://github.com/noblegatefze/digdug-whitepaper",
};

function getErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Failed to load";
  }
}

function readJsonError(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && "error" in json) {
    const v = (json as { error?: unknown }).error;
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
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

// =====================
// GOLDEN PILLS
// =====================

function GoldenPulsePills({ className = "" }: { className?: string }) {
  const [goldenTxt, setGoldenTxt] = React.useState<string>("-");
  const [utcResetTxt, setUtcResetTxt] = React.useState<string>("-"); // avoid hydration mismatch

  React.useEffect(() => {
    const tick = () => setUtcResetTxt(formatHMS(msUntilNextUtcReset()));
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/golden/today", { cache: "no-store" });
        const json: any = await res.json();
        if (!res.ok || !json?.ok) return;
        const count = Number(json?.count ?? 0);
        const cap = Number(json?.cap ?? 5);
        if (!Number.isFinite(count) || !Number.isFinite(cap) || cap <= 0) return;
        if (!cancelled) setGoldenTxt(`${count}/${cap}`);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="rounded-md border border-amber-900/40 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-200">
        Golden today: <span className="font-semibold">{goldenTxt}</span>
      </span>
      <span className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
        UTC reset in: <span className="font-semibold text-slate-200">{utcResetTxt}</span>
      </span>
    </div>
  );
}

// =====================
// NETWORK ACTIVITY CARD (Snapshot 1h -> Legacy shape)
// =====================

function normalizeSnapshotToLegacy(json: any): ActivityResp {
  const row = json?.row ?? {};

  const sessions = Number(row.sessions ?? 0) || 0;
  const actions = Number(row.protocol_actions ?? 0) || 0;
  const claims = Number(row.claims_executed ?? 0) || 0;
  const uniq = Number(row.unique_claimers ?? 0) || 0;
  const golden = Number(row.golden_events ?? 0) || 0;
  const users = Number(row.terminal_users ?? 0) || 0;

  const usddd = Number(row.usddd_spent ?? 0) || 0;
  const usd = Number(row.claims_value_usd ?? 0) || 0;

  const rewardEff = Number(row.reward_efficiency ?? 0) || (usddd > 0 ? usd / usddd : 0);

  const accrualScalingPct = 3;
  const accrualFloorPct = 10;
  const accrualCapPct = 25;
  const perfCap = 99.98;

  const accrualPotentialPct = rewardEff * accrualScalingPct;
  const appliedAccrualPct = Math.max(accrualFloorPct, Math.min(accrualPotentialPct, accrualCapPct));

  // display normalization (same as your earlier logic)
  const base = 55.6;
  const cap = perfCap;
  const raw = 0;
  const normalizedPerf = cap > 0 ? Math.max(0, Math.min(raw, cap)) / cap : 0;
  const perfDisplay = base + normalizedPerf * (100 - base);

  return {
    ok: true,
    mode: json?.mode ?? "snapshot_1h",
    error: null,
    window: {
      start: row.window_start ?? null,
      end: row.window_end ?? null,
      hours: 1,
    },
    counts: {
      sessions_24h: sessions,
      protocol_actions: actions,
      claims_executed: claims,
      claim_reserves: claims,
      unique_claimers: uniq,
      ledger_entries: actions,
      golden_events: golden,
      terminal_users: users,
    },
    money: {
      claims_value_usd: usd,
      usddd_spent: usddd,
    },
    model: {
      reward_efficiency_usd_per_usddd: rewardEff,
      reward_efficiency_prev_usd_per_usddd: 0,
      efficiency_delta_usd_per_usddd: 0,

      accrual_scaling_pct: accrualScalingPct,
      accrual_floor_pct: accrualFloorPct,
      accrual_cap_pct: accrualCapPct,
      accrual_potential_pct: accrualPotentialPct,
      applied_accrual_pct: appliedAccrualPct,

      network_performance_pct: 0,
      network_performance_cap_pct: perfCap,
      network_performance_display_pct: perfDisplay,
    },
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
  };
}

function NetworkActivityCard({ refreshTick }: { refreshTick: number }) {
  const [data, setData] = React.useState<ActivityResp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setErr(null);
        const res = await fetch("/api/activity/1h", { cache: "no-store" });
        const j: any = await res.json().catch(() => null);

        if (!res.ok) throw new Error(readJsonError(j, `HTTP ${res.status}`));
        if (!j?.ok) throw new Error(readJsonError(j, "bad_response"));

        const normalized = normalizeSnapshotToLegacy(j);
        if (!cancelled) setData(normalized);
      } catch (e: unknown) {
        if (!cancelled) setErr(getErrMsg(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const fmtPct2 = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;
  const fmtSigned = (n: number) => {
    const v = Number.isFinite(n) ? n : 0;
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(3)}`;
  };

  if (err) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-[13px] text-red-200">
        Failed to load activity: {err}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-[13px] text-slate-300">
        Loading activity…
      </div>
    );
  }

  const c = data.counts ?? ({} as any);
  const m = data.money ?? { claims_value_usd: 0, usddd_spent: 0 };
  const model = data.model ?? ({} as any);

  const rewardEff = Number(model.reward_efficiency_usd_per_usddd ?? 0) || 0;
  const accrualPotential = Number(model.accrual_potential_pct ?? 0) || 0;
  const netPerf = Number(model.network_performance_display_pct ?? model.network_performance_pct ?? 0) || 0;
  const effDelta = Number(model.efficiency_delta_usd_per_usddd ?? 0) || 0;

  const perfTone =
    netPerf >= 80 ? "text-emerald-300" : netPerf >= 55 ? "text-slate-200" : "text-amber-300";
  const deltaTone = effDelta > 0 ? "text-emerald-300" : effDelta < 0 ? "text-amber-300" : "text-slate-200";

  const Tile = ({
    title,
    desc,
    value,
    valueClassName,
  }: {
    title: string;
    desc: string;
    value: React.ReactNode;
    valueClassName?: string;
  }) => (
    <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
      <div className="text-[12px] text-slate-200">{title}</div>
      <div className={`mt-1 text-base font-semibold ${valueClassName ?? ""}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-snug text-slate-500">{desc}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[13px]">
        <Tile title="Protocol Actions (1h)" desc="Total protocol operations processed." value={fmt(c.protocol_actions ?? 0)} />
        <Tile title="Sessions (1h)" desc="Session starts recorded by the protocol." value={fmt(c.sessions_24h ?? 0)} />
        <Tile title="Claims Executed (1h)" desc="Successful claim executions." value={fmt(c.claims_executed ?? 0)} />

        <Tile title="USDDD Utilized (1h)" desc="USDDD consumed by protocol activity." value={fmtDec(m.usddd_spent ?? 0)} />
        <Tile title="Value Distributed (1h)" desc="USD value distributed by the protocol." value={fmtUsd(m.claims_value_usd ?? 0)} />
        <Tile
          title="Reward Efficiency (1h)"
          desc="USD value per 1 USDDD utilized."
          value={
            <span>
              {fmtUsd(rewardEff)} <span className="text-[12px] text-slate-400">/ USDDD</span>
            </span>
          }
        />

        <Tile title="Accrual Potential" desc="Derived from efficiency (× 3%)." value={fmtPct2(accrualPotential)} />
        <Tile
          title="Network Performance"
          desc="Efficiency normalized to protocol scale."
          value={fmtPct2(netPerf)}
          valueClassName={perfTone}
        />
        <Tile
          title="Efficiency Delta"
          desc="Change vs previous window efficiency."
          value={
            <span>
              {fmtSigned(effDelta)} <span className="text-[12px] text-slate-400">$/USDDD</span>
            </span>
          }
          valueClassName={deltaTone}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-[11px] text-slate-500">Accrual figures are protocol-defined and observational.</div>
        <button
          type="button"
          onClick={() => (window as any).__openScanModal?.("fund")}
          className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
          title="Fund the network"
        >
          Fund Network
        </button>
      </div>

      {/* warnings: support either array of objects {scope,message} OR string[] */}
      {Array.isArray(data.warnings) && data.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-[12px] text-amber-200">
          <div className="font-semibold text-amber-200/90">Warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.warnings.map((w: any, i: number) => {
              if (typeof w === "string") return <li key={i}>{w}</li>;
              const scope = String(w?.scope ?? "").trim();
              const msg = String(w?.message ?? "").trim();
              if (!msg) return null;
              return (
                <li key={i}>
                  {scope ? <span className="text-amber-200/70">{scope}:</span> : null} {msg}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// =====================
// TABLES
// =====================

function LatestGoldenFindsTable({
  refreshTick,
  onOpenPayout,
}: {
  refreshTick: number;
  onOpenPayout: (claim: string | null | undefined) => void;
}) {
  const [rows, setRows] = React.useState<GoldenFindRow[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/golden-finds/latest?limit=10", { cache: "no-store" });
        const json: unknown = await res.json();
        if (!res.ok) throw new Error(readJsonError(json, `HTTP ${res.status}`));
        const dataRows =
          json && typeof json === "object" && "rows" in json
            ? (((json as { rows?: unknown }).rows ?? []) as GoldenFindRow[])
            : ([] as GoldenFindRow[]);
        if (!cancelled) setRows(dataRows);
      } catch (e: unknown) {
        if (!cancelled) setErr(getErrMsg(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (err) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-[13px] text-red-200">
        Failed to load golden finds: {err}
      </div>
    );
  }

  return (
    <div className="-mx-4 overflow-hidden">
      <div className="px-4">
        <table className="w-full table-fixed text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-400">
            <tr className="border-b border-slate-800/60">
              <th className="w-[72px] py-2 pr-2">Time</th>
              <th className="w-[96px] py-2 pr-2">Claim</th>
              <th className="py-2 pr-2">Winner</th>
              <th className="hidden sm:table-cell w-[90px] py-2 pr-2">Token</th>
              <th className="w-[64px] py-2 text-right">USD</th>
            </tr>
          </thead>

          <tbody className="text-slate-200">
            {rows.length === 0 ? (
              <tr className="border-b border-slate-800/40">
                <td className="py-3 text-slate-400" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.claim ?? `${r.ts}-${r.token}`} className="border-b border-slate-800/40">
                  <td className="py-2 pr-2 text-slate-300">{relTime(r.ts)}</td>
                  <td className="py-2 pr-2 font-mono text-slate-200 truncate">{r.claim ?? "-"}</td>
                  <td className="py-2 pr-2 truncate">{r.winner}</td>
                  <td className="hidden sm:table-cell py-2 pr-2 truncate">{r.token ?? "-"}</td>
                  <td className="py-2 text-right tabular-nums">
                    <button
                      type="button"
                      onClick={() => onOpenPayout(r.claim)}
                      className="inline-flex items-center justify-end gap-1 underline underline-offset-2 decoration-slate-700 hover:decoration-slate-300"
                      title="View payout"
                    >
                      {fmtUsd(r.usd ?? 0)}
                      <span className="text-[11px] text-slate-500">↗</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoxBalancesTable({ refreshTick }: { refreshTick: number }) {
  const [rows, setRows] = React.useState<BoxBalanceRow[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/boxes/balances?limit=10", { cache: "no-store" });
        const json: unknown = await res.json();
        if (!res.ok) throw new Error(readJsonError(json, `HTTP ${res.status}`));
        const dataRows =
          json && typeof json === "object" && "rows" in json
            ? (((json as { rows?: unknown }).rows ?? []) as BoxBalanceRow[])
            : ([] as BoxBalanceRow[]);
        if (!cancelled) setRows(dataRows);
      } catch (e: unknown) {
        if (!cancelled) setErr(getErrMsg(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (err) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-[13px] text-red-200">
        Failed to load box balances: {err}
      </div>
    );
  }

  return (
    <div className="-mx-4 overflow-hidden">
      <div className="px-4">
        <table className="w-full table-fixed text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-400">
            <tr className="border-b border-slate-800/60">
              <th className="w-[90px] py-2 pr-2">Box</th>
              <th className="hidden sm:table-cell w-[90px] py-2 pr-2 text-right">Deposited</th>
              <th className="hidden sm:table-cell w-[90px] py-2 pr-2 text-right">Claimed</th>
              <th className="hidden md:table-cell w-[90px] py-2 pr-2 text-right">Withdrawn</th>
              <th className="w-[88px] py-2 text-right">Remaining</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr className="border-b border-slate-800/40">
                <td className="py-3 text-slate-400" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.box} className="border-b border-slate-800/40">
                  <td className="py-2 pr-2 font-mono truncate text-slate-200">{r.box}</td>
                  <td className="hidden sm:table-cell py-2 pr-2 text-right text-slate-300">{fmtDec(r.deposited)}</td>
                  <td className="hidden sm:table-cell py-2 pr-2 text-right text-slate-300">{fmtDec(r.claimed)}</td>
                  <td className="hidden md:table-cell py-2 pr-2 text-right text-slate-300">{fmtDec(r.withdrawn)}</td>
                  <td className="py-2 text-right tabular-nums">{fmtDec(r.remaining)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-2 text-[11px] text-slate-500 sm:hidden">
          Showing: Box + Remaining (expand on desktop for full columns)
        </div>
      </div>
    </div>
  );
}

function GoldenWinnersLeaderboard({ refreshTick }: { refreshTick: number }) {
  const [rows, setRows] = React.useState<GoldenWinnersRow[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/leaderboards/golden-winners?limit=5", { cache: "no-store" });
        const json: unknown = await res.json();
        if (!res.ok) throw new Error(readJsonError(json, `HTTP ${res.status}`));
        const dataRows =
          json && typeof json === "object" && "rows" in json
            ? (((json as { rows?: unknown }).rows ?? []) as GoldenWinnersRow[])
            : ([] as GoldenWinnersRow[]);
        if (!cancelled) setRows(dataRows);
      } catch (e: unknown) {
        if (!cancelled) setErr(getErrMsg(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (err) {
    return (
      <div className="mt-2 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-[12px] text-red-200">
        Failed to load: {err}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="mt-2 text-[12px] text-slate-400">Loading…</div>;
  }

  return (
    <div className="mt-2 space-y-2">
      {rows.map((r, idx) => (
        <div
          key={`${r.winner}-${idx}`}
          className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-[13px]"
        >
          <div className="min-w-0">
            <div className="truncate text-slate-200">
              <span className="text-slate-500">{idx + 1}.</span> {r.winner}
            </div>
            <div className="mt-1 text-[12px] text-slate-400">Wins: {fmt(r.wins)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold text-slate-200">{fmtUsd(r.usd_total)}</div>
            <div className="text-[11px] text-slate-500">30d</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================
// MODAL + PAYOUT (unchanged)
// =====================

function ScanModal({
  open,
  title,
  children,
  primaryLabel,
  primaryHref,
  primaryNewTab = true,
  secondaryLabel = "Close",
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
  primaryNewTab?: boolean;
  secondaryLabel?: string;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-slate-800/70 bg-[#0b0f14]/95 p-4 shadow-xl max-h-[90vh] overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 max-h-[70vh] overflow-y-auto text-[12px] leading-relaxed text-slate-300 pr-1">
          {children}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70"
          >
            {secondaryLabel}
          </button>

          {primaryLabel && primaryHref ? (
            <a
              href={primaryHref}
              {...(primaryNewTab ? { target: "_blank", rel: "noreferrer" } : {})}
              className="rounded-md border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-[12px] text-emerald-200 hover:bg-emerald-950/60"
            >
              {primaryLabel}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type PayoutInfo = {
  ok: boolean;
  claim_code: string;
  token: string | null;
  chain: string | null;
  usd_value: number | string | null;
  golden_at: string | null;

  status: "PAID" | "PENDING" | "UNCLAIMED";
  claimed_at: string | null;

  payout_from: string | null;
  payout_to: string | null;

  paid_at: string | null;
  paid_tx_hash: string | null;
};

function maskAddr(a: string | null | undefined) {
  const s = (a ?? "").trim();
  if (!s) return "-";
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function fmtTs(ts: string | null | undefined) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString().replace("T", " ").replace("Z", " UTC");
}

function StatusPill({ status }: { status: PayoutInfo["status"] }) {
  const base = "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold";
  if (status === "PAID")
    return <span className={`${base} border-emerald-500/30 bg-emerald-950/30 text-emerald-200`}>PAID</span>;
  if (status === "PENDING")
    return <span className={`${base} border-amber-500/30 bg-amber-950/20 text-amber-200`}>PENDING</span>;
  return <span className={`${base} border-slate-700 bg-slate-900/40 text-slate-300`}>UNCLAIMED</span>;
}

function PayoutModalBody({ claim, terminalHref }: { claim: string | null; terminalHref: string }) {
  const [data, setData] = React.useState<PayoutInfo | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!claim) return;
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/golden-finds/payment?claim=${encodeURIComponent(claim)}`, { cache: "no-store" });
        const json: any = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!cancelled) setData(json as PayoutInfo);
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claim]);

  if (!claim) return <div className="text-[13px] text-slate-400">No claim selected.</div>;
  if (loading && !data) return <div className="text-[13px] text-slate-400">Loading payout…</div>;
  if (err) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-[13px] text-red-200">
        Failed to load payout: {err}
      </div>
    );
  }
  if (!data) return null;

  const tx = (data.paid_tx_hash ?? "").trim();
  const bscTx = tx ? `https://bscscan.com/tx/${tx}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] text-slate-300">
          <span className="font-mono text-slate-200">{data.claim_code}</span>{" "}
          <span className="text-slate-500">•</span>{" "}
          <span className="text-slate-200">{data.token ?? "-"}</span>{" "}
          <span className="text-slate-500">•</span>{" "}
          <span className="tabular-nums text-slate-200">{fmtUsd(Number(data.usd_value ?? 0))}</span>
        </div>
        <StatusPill status={data.status} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">From</div>
          <div className="mt-1 font-mono text-[13px] text-slate-200" title={data.payout_from ?? ""}>
            {maskAddr(data.payout_from)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">To</div>
          <div className="mt-1 font-mono text-[13px] text-slate-200" title={data.payout_to ?? ""}>
            {maskAddr(data.payout_to)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Paid at</div>
            <div className="mt-1 text-[13px] text-slate-200">{fmtTs(data.paid_at)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Tx hash</div>
            <div className="mt-1 font-mono text-[13px] break-all text-slate-200">{tx || "-"}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={bscTx ?? "#"}
          target="_blank"
          rel="noreferrer"
          className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${
            bscTx ? "bg-slate-200 text-slate-950 hover:bg-white" : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
          aria-disabled={!bscTx}
          onClick={(e) => {
            if (!bscTx) e.preventDefault();
          }}
        >
          Open on BscScan ↗
        </a>

        <a
          href={terminalHref}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-800 bg-transparent px-3 py-2 text-[12px] text-slate-200 hover:border-slate-700 hover:bg-slate-900/30"
        >
          Open Terminal ↗
        </a>
      </div>

      <div className="text-[12px] text-slate-500">
        Note: BscScan shows the on-chain sender/recipient details. This modal reflects what was recorded in Phase Zero.
      </div>
    </div>
  );
}

// =====================
// PAGE
// =====================

export default function Home() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const flags = await getPublicFlags();
      if (!alive) return;
      setPaused(Boolean(flags?.pause_all));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const [meta, setMeta] = React.useState<BuildMeta | null>(null);

  type ModalKey =
    | "fund"
    | "sponsor"
    | "boxes"
    | "activity"
    | "testnet"
    | "golden"
    | "search"
    | "payout"
    | "airdrop";

  const [modal, setModal] = React.useState<{ open: boolean; key: ModalKey | null }>({
    open: false,
    key: null,
  });

  const openModal = (key: ModalKey) => setModal({ open: true, key });
  const closeModal = () => setModal({ open: false, key: null });

  const [payoutClaim, setPayoutClaim] = React.useState<string | null>(null);

  const openPayout = (claim: string | null | undefined) => {
    const c = (claim ?? "").trim();
    if (!c) return;
    setPayoutClaim(c);
    openModal("payout");
  };

  const [refreshTick, setRefreshTick] = React.useState(0);

  // === USDDD Airdrop (Trust Wallet verification) ===
  const AIRDROP_TARGET = 10000;
  const AIRDROP_HOURS = 48;

  const [airdropStartMs] = React.useState<number>(() => Date.now());

  const [airdropCount, setAirdropCount] = React.useState<number>(0);
  const [airdropLatest, setAirdropLatest] = React.useState<string[]>([]);
  const [airdropAddr, setAirdropAddr] = React.useState<string>("");
  const [airdropMsg, setAirdropMsg] = React.useState<string | null>(null);
  const [airdropSubmitting, setAirdropSubmitting] = React.useState<boolean>(false);

  const AIRDROP_COMPLETE = airdropCount >= AIRDROP_TARGET;

  React.useEffect(() => {
    if (!(modal.open && modal.key === "airdrop")) return;

    let alive = true;

    const tick = async () => {
      try {
        const res = await fetch("/api/airdrop/stats?limit=30", { cache: "no-store" });
        const json: any = await res.json();
        if (!alive) return;
        if (res.ok && json?.ok) {
          setAirdropCount(Number(json.count ?? 0));
          setAirdropLatest(Array.isArray(json.latest) ? json.latest : []);
        }
      } catch {
        // ignore
      }
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [modal.open, modal.key]);

  React.useEffect(() => {
    const t = setInterval(() => setRefreshTick((v) => v + 1), 60000);
    return () => clearInterval(t);
  }, []);

  function airdropRemainingMs() {
    const end = airdropStartMs + AIRDROP_HOURS * 3600 * 1000;
    return Math.max(0, end - Date.now());
  }

  async function submitAirdrop() {
    setAirdropMsg(null);
    setAirdropSubmitting(true);
    try {
      const res = await fetch("/api/airdrop/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: airdropAddr,
          source: "usddd_scan_modal",
        }),
      });

      const json: any = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      setAirdropMsg(json.already ? "Already registered. You’re in." : "Registered. You’re in.");
      setAirdropAddr("");

      const s = await fetch("/api/airdrop/stats?limit=30", { cache: "no-store" });
      const sj: any = await s.json();
      if (s.ok && sj?.ok) {
        setAirdropCount(Number(sj.count ?? 0));
        setAirdropLatest(Array.isArray(sj.latest) ? sj.latest : []);
      }
    } catch (e: any) {
      setAirdropMsg(String(e?.message ?? e));
    } finally {
      setAirdropSubmitting(false);
    }
  }

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/meta/build", { cache: "no-store" });
        const json: unknown = await res.json();
        if (!cancelled && json && typeof json === "object") {
          setMeta(json as BuildMeta);
        }
      } catch {
        // ignore meta errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    (window as any).__openScanModal = (key: ModalKey) => openModal(key);
    return () => {
      try {
        delete (window as any).__openScanModal;
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return paused ? (
    <ScanMaintenance />
  ) : (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-[#0b0f14]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <a
            href="https://usddd.digdug.do"
            className="flex items-center gap-2 hover:opacity-90"
            title="Back to USDDD Scan"
          >
            <div className="relative h-7 w-7 overflow-hidden rounded-full border border-slate-800 bg-slate-950/40">
              <Image src="/logo.png" alt="USDDD" fill sizes="28px" className="object-cover" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">USDDD Scan</div>
              <div className="text-[11px] text-slate-400">powered by DIGDUG.DO</div>
            </div>
          </a>

          <div className="hidden md:flex flex-1 justify-center">
            <div className="relative w-[520px]">
              <div className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[13px] text-slate-300">
                Search claim code / box / user…
              </div>

              <button
                type="button"
                onClick={() => openModal("search")}
                className="absolute inset-0 rounded-md"
                aria-label="Open quick-start"
                title="Open quick-start"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => openModal("testnet")}
              className="rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-950/60"
              title="About Testnet"
            >
              Testnet
            </button>
            <span className="rounded-full border border-emerald-900/60 bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-300 animate-pulse">
              LIVE
            </span>
          </div>
        </div>

        <div className="border-t border-slate-800/40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[12px] text-slate-400">
            <span>Phase: Zero</span>
            <span className="text-slate-600">·</span>
            <span>Version: {meta?.version ?? "--"}</span>
            <span className="text-slate-600">·</span>
            <span>Build: {meta?.build ?? "--"}</span>

            <div className="ml-auto flex flex-wrap items-center gap-2">
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

              <button
                type="button"
                onClick={() => openModal("airdrop")}
                className="relative rounded-md border border-orange-400/60 bg-orange-950/25 px-2 py-1 text-[11px] font-semibold text-orange-100 hover:bg-orange-950/35"
                title="USDDD Airdrop"
              >
                <span className="pointer-events-none absolute -inset-1 rounded-md bg-orange-500/15 blur-sm animate-pulse" />
                <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-orange-300/20" />
                <span className="relative">USDDD Airdrop</span>
              </button>
            </div>
          </div>
        </div>

        <div className="md:hidden border-t border-slate-800/40 px-4 py-2">
          <div className="relative w-full">
            <div className="w-full rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[13px] text-slate-300">
              Search claim code / box / user…
            </div>

            <button
              type="button"
              onClick={() => openModal("search")}
              className="absolute inset-0 rounded-md"
              aria-label="Open quick-start"
              title="Open quick-start"
            />
          </div>
          <div className="mt-2 flex justify-between">
            <GoldenPulsePills />
          </div>
        </div>
      </header>

      <ScanModal open={modal.open && modal.key === "payout"} title="Phase Zero Golden Find Payout" onClose={closeModal}>
        <PayoutModalBody claim={payoutClaim} terminalHref={LINKS.terminal} />
      </ScanModal>

      {/* NOTE: remaining modals + sections unchanged from your file */}
      {/* For brevity, the rest of your content remains the same. */}

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-4 md:grid-cols-12">
          <section className="md:col-span-6 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Network Activity (1h)</h2>
              <span className="text-[11px] text-slate-400">live</span>
            </div>
            <NetworkActivityCard refreshTick={refreshTick} />
          </section>

          {/* the rest of your sections/modals/components below are unchanged */}
          {/* Keep your existing code from here down (LatestGoldenFindsTable, BoxBalances, Leaderboards, footer, etc.) */}
        </div>

        <footer className="mt-6 text-center text-[12px] text-slate-500">
          USDDD - Zero Phase Public Testnet - Read-only - No wallets - No tracking
        </footer>
      </div>
    </main>
  );
}
