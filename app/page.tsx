"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { getPublicFlags } from "./lib/flags";
import { ScanMaintenance } from "./_maintenance/ScanMaintenance";

type ActivityResp = {
  window: { start: string; end: string; hours: number };
  counts: {
    claims: number;
    unique_claimers: number;
    ledger_entries: number;
    claim_reserves: number;
  };
  money?: {
    claims_value_usd: number;
    usddd_spent: number;
  };
  warnings?: Array<{ scope: string; message: string }>;
  schema_assumption?: { timestamp_column?: string };
};

type GoldenFindRow = {
  ts: string | null;
  claim: string | null;
  winner: string;
  token: string | null;
  chain: string | null;
  usd: number;
  tx?: string | null; // NEW
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

function GoldenPulsePills({ className = "" }: { className?: string }) {
  const [goldenTxt, setGoldenTxt] = React.useState<string>("-");
  const [utcResetTxt, setUtcResetTxt] = React.useState<string>("-"); // avoid hydration mismatch

  React.useEffect(() => {
    const tick = () => setUtcResetTxt(formatHMS(msUntilNextUtcReset()));
    tick();
    const t = setInterval(tick, 1000);

    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/golden/today");
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

function NetworkActivityCard({ refreshTick }: { refreshTick: number }) {
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/activity/24h");
        const json: unknown = await res.json();
        if (!res.ok) throw new Error(readJsonError(json, `HTTP ${res.status}`));
        if (!cancelled) setData(json);
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

  const c = data.counts ?? {};
  const m = data.money ?? { claims_value_usd: 0, usddd_spent: 0 };
  const model = data.model ?? {};

  const rewardEff = Number(model.reward_efficiency_usd_per_usddd ?? 0) || 0;
  const accrualPotential = Number(model.accrual_potential_pct ?? 0) || 0;
  const netPerf = Number(model.network_performance_display_pct ?? model.network_performance_pct ?? 0) || 0;
  const effDelta = Number(model.efficiency_delta_usd_per_usddd ?? 0) || 0;

  // subtle value styling (protocol tone)
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
      {/* 3×3 on desktop, 2 columns on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[13px]">
        {/* Row 1 */}
        <Tile
          title="Protocol Actions (24h)"
          desc="Total protocol operations processed."
          value={fmt(c.protocol_actions ?? 0)}
        />
        <Tile
          title="Sessions (24h)"
          desc="Session starts recorded by the protocol."
          value={fmt(c.sessions_24h ?? 0)}
        />
        <Tile
          title="Claims Executed (24h)"
          desc="Successful claim executions."
          value={fmt(c.claims_executed ?? 0)}
        />

        {/* Row 2 */}
        <Tile
          title="USDDD Utilized (24h)"
          desc="USDDD consumed by protocol activity."
          value={fmtDec(m.usddd_spent ?? 0)}
        />
        <Tile
          title="Value Distributed (24h)"
          desc="USD value distributed by the protocol."
          value={fmtUsd(m.claims_value_usd ?? 0)}
        />
        <Tile
          title="Reward Efficiency (24h)"
          desc="USD value per 1 USDDD utilized."
          value={
            <span>
              {fmtUsd(rewardEff)} <span className="text-[12px] text-slate-400">/ USDDD</span>
            </span>
          }
        />

        {/* Row 3 */}
        <Tile
          title="Accrual Potential"
          desc="Derived from efficiency (× 3%)."
          value={fmtPct2(accrualPotential)}
        />
        <Tile
          title="Network Performance"
          desc="Efficiency normalized to protocol scale."
          value={fmtPct2(netPerf)}
          valueClassName={perfTone}
        />
        <Tile
          title="Efficiency Delta (24h)"
          desc="Change vs previous 24h efficiency."
          value={
            <span>
              {fmtSigned(effDelta)} <span className="text-[12px] text-slate-400">$/USDDD</span>
            </span>
          }
          valueClassName={deltaTone}
        />
      </div>

      {/* Footer row inside the card */}
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

      {/* Warnings (only show if non-empty messages) */}
      {data.warnings &&
        Array.isArray(data.warnings) &&
        data.warnings.some((w: any) => (w?.message ?? "").trim().length) && (
          <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-[12px] text-amber-200">
            <div className="font-semibold text-amber-200/90">Warnings</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {data.warnings
                .filter((w: any) => (w?.message ?? "").trim().length)
                .map((w: any, i: number) => (
                  <li key={i}>
                    <span className="text-amber-200/70">{w.scope}:</span> {w.message}
                  </li>
                ))}
            </ul>
          </div>
        )}
    </div>
  );
}

function LatestGoldenFindsTable({ refreshTick }: { refreshTick: number }) {
  const [rows, setRows] = React.useState<GoldenFindRow[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/golden-finds/latest?limit=10");
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
                    {r.tx ? (
                      <a
                        href={`/tx/${encodeURIComponent(r.tx)}`}
                        className="inline-flex items-center justify-end gap-1 text-slate-200 hover:text-slate-50 underline underline-offset-2 decoration-slate-600 hover:decoration-slate-300"
                        title="View payment tx"
                      >
                        {fmtUsd(r.usd ?? 0)}
                        <span className="text-[11px] text-slate-500">↗</span>
                      </a>
                    ) : (
                      <span className="text-slate-300">{fmtUsd(r.usd ?? 0)}</span>
                    )}
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
        const res = await fetch("/api/boxes/balances?limit=10");
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
                  <td className="py-2 pr-2 font-mono truncate text-slate-200">
                    {r.box}
                  </td>
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
        const res = await fetch("/api/leaderboards/golden-winners?limit=5");
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
      <div className="relative w-full max-w-lg rounded-xl border border-slate-800/70 bg-[#0b0f14]/95 p-4 shadow-xl">
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

        <div className="mt-3 text-[12px] leading-relaxed text-slate-300">{children}</div>

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

export default function Home() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const flags = await getPublicFlags();
      if (!alive) return;
      setPaused(Boolean(flags?.pause_all));
    })();
    return () => { alive = false; };
  }, []);



  const [meta, setMeta] = React.useState<BuildMeta | null>(null);

  type ModalKey = "fund" | "sponsor" | "boxes" | "activity" | "testnet" | "golden" | "search";
  const [modal, setModal] = React.useState<{ open: boolean; key: ModalKey | null }>({ open: false, key: null });

  const openModal = (key: ModalKey) => setModal({ open: true, key });
  const closeModal = () => setModal({ open: false, key: null });

  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setRefreshTick((v) => v + 1), 60000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/meta/build");
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
            </div>
          </div>
        </div>

        {/* Mobile search + pulse directly beneath (same line) */}
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

      <ScanModal
        open={modal.open && modal.key === "testnet"}
        title="Zero Phase Testnet"
        onClose={closeModal}
        primaryLabel="Join Telegram"
        primaryHref={LINKS.telegram}
      >
        <div className="space-y-3">
          <p>
            You're viewing the public Zero Phase testnet. Real users are actively exercising the protocol while we monitor network activity,
            tighten rules, and eliminate broken flows.
          </p>

          <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
            <div className="text-[12px] font-semibold text-slate-200">What's real right now</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-slate-300">
              <li>Live network activity and telemetry on Scan.</li>
              <li>Protocol actions and claim execution paths.</li>
              <li>
                <span className="font-semibold">Golden Finds</span> funded by protocol/sponsors.
              </li>
            </ul>
          </div>

          <p className="text-slate-400">
            Most rewards in testnet are mock for testing. Genesis Phase is the mainnet transition where reward rules become final and funding expands.
          </p>
        </div>
      </ScanModal>

      <ScanModal
        open={modal.open && modal.key === "fund"}
        title="Fund Network"
        onClose={closeModal}
        primaryLabel="Fund Network"
        primaryHref="https://usddd.digdug.do/fund"
        primaryNewTab={false}
      >
        <div className="space-y-3">
          <p>
            Funding the network means you provision USDT (BEP-20) into the protocol's funding layer. In return, the protocol allocates custodied
            USDDD tied to network performance and the current Accrual Reference.
          </p>

          <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
            <div className="text-[12px] font-semibold text-slate-200">Benefits</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-slate-300">
              <li>Dedicated deposit address per position (traceable and auditable).</li>
              <li>Custodied USDDD allocation tracked and surfaced on Scan.</li>
              <li>Accrual is protocol-defined and observable (no hidden calculations).</li>
            </ul>
          </div>

          <p className="text-slate-400">
            Withdrawals remain locked during Zero Phase while we harden the system. Genesis unlock rules will be announced in Docs and Telegram.
          </p>
        </div>
      </ScanModal>

      <ScanModal
        open={modal.open && modal.key === "sponsor"}
        title="Become a Sponsor"
        onClose={closeModal}
        primaryLabel="Open Terminal"
        primaryHref={LINKS.terminal}
      >
        <div className="space-y-3">
          <p className="text-slate-300">
            Sponsor boxes deploy rewards to the network and surface publicly on Scan. Full sponsor guide coming next.
          </p>
          <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-[12px] text-slate-300">
            Terminal command: <span className="font-mono text-slate-200">create box</span>
          </div>
        </div>
      </ScanModal>

      <ScanModal
        open={modal.open && modal.key === "boxes"}
        title="View all boxes"
        onClose={closeModal}
        primaryLabel="Open Terminal"
        primaryHref={LINKS.terminal}
      >
        <div className="space-y-3">
          <p className="text-slate-300">
            Box Balances live in the Terminal. Browse sponsor boxes and inventories in Terminal.
          </p>
          <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-[12px] text-slate-300">
            Terminal command: <span className="font-mono text-slate-200">dig</span> - choose{" "}
            <span className="font-mono text-slate-200">Treasure (2)</span>
          </div>
        </div>
      </ScanModal>

      <ScanModal
        open={modal.open && modal.key === "golden"}
        title="Golden Finds"
        onClose={closeModal}
        primaryLabel="Open Terminal"
        primaryHref={LINKS.terminal}
      >
        <div className="space-y-3">
          <p>
            Golden Finds are the network's limited daily wins - rare, time-based rewards that appear inside the DIG flow. When a Golden Find is hit,
            it's recorded publicly here on Scan.
          </p>

          <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
            <div className="text-[12px] font-semibold text-amber-200">How to hunt Golden Finds</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] text-amber-100/90">
              <li>Open the Terminal.</li>
              <li>
                Type: <span className="font-mono text-amber-50">dig</span>
              </li>
              <li>Follow the prompts and watch for Golden activity.</li>
            </ol>
          </div>

          <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-[12px] text-slate-300">
            <div className="font-semibold text-slate-200">Where updates happen</div>
            <div className="mt-1 text-slate-400">
              Live drops, rules, and announcements are posted in Telegram as we tune the protocol through Zero Phase.
            </div>
          </div>

          <p className="text-slate-400">
            Tip: Golden Finds are capped daily (see 'Golden today' at the top). If you want to stay ahead of the wave, keep Scan open and join Telegram.
          </p>
        </div>
      </ScanModal>

      <ScanModal
        open={modal.open && modal.key === "search"}
        title="Don't search. DIG."
        onClose={closeModal}
        primaryLabel="Open Terminal"
        primaryHref={LINKS.terminal}
      >
        <div className="space-y-3">
          <p>
            This is a live protocol surface - not a directory. The fastest way to understand USDDD is to interact with it:
            DIG, sponsor boxes, or fund the network.
          </p>

          <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
            <div className="text-[12px] font-semibold text-slate-200">Three ways to join the network</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-slate-300">
              <li>
                <span className="font-semibold text-slate-200">DIG</span> for rewards in the Terminal.
                <span className="ml-2 font-mono text-slate-200">dig</span>
              </li>
              <li>
                <span className="font-semibold text-slate-200">Sponsor</span> a box and deploy rewards publicly on Scan.
                <span className="ml-2 font-mono text-slate-200">create box</span>
              </li>
              <li>
                <span className="font-semibold text-slate-200">Fund</span> the network and receive custodied USDDD allocation.
                <span className="ml-2 text-slate-200">/fund</span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3 text-[12px] text-emerald-200">
            USDDD is by the people, for the people - transparency first. If you want to be early, join Telegram and help shape Genesis.
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href="https://usddd.digdug.do/fund"
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70"
            >
              Fund Network
            </a>
            <a
              href={LINKS.telegram}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-950/70"
            >
              Join Telegram
            </a>
          </div>
        </div>
      </ScanModal>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-4 md:grid-cols-12">
          <section className="md:col-span-6 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Network Activity (24h)</h2>
              <span className="text-[11px] text-slate-400">live</span>
            </div>
            <NetworkActivityCard refreshTick={refreshTick} />
          </section>

          <section className="md:col-span-6 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-200">Latest Golden Finds</h2>

              <div className="flex items-center gap-2">
                <div className="hidden md:flex">
                  <GoldenPulsePills />
                </div>
                <button
                  type="button"
                  onClick={() => openModal("golden")}
                  className="text-[11px] text-slate-400 hover:text-slate-200"
                >
                  View all
                </button>
              </div>
            </div>

            <LatestGoldenFindsTable refreshTick={refreshTick} />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="text-[12px] text-slate-400">Use the Terminal to DIG and earn rewards.</div>
              <a
                href={LINKS.terminal}
                target="_blank"
                rel="noreferrer"
                className="ml-auto rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
              >
                Open Terminal
              </a>
              <a
                href={LINKS.telegram}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
              >
                Join Telegram
              </a>
            </div>
          </section>

          <section className="md:col-span-8 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Box Balances</h2>
              <button
                type="button"
                onClick={() => openModal("boxes")}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                View all
              </button>
            </div>

            <BoxBalancesTable refreshTick={refreshTick} />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="text-[12px] text-slate-400">Deploy a box, fund rewards, gain exposure.</div>
              <button
                type="button"
                onClick={() => openModal("sponsor")}
                className="ml-auto rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
              >
                Become a Sponsor
              </button>
              <a
                href={LINKS.docs}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
              >
                Sponsor Docs
              </a>
            </div>
          </section>

          <section className="md:col-span-4 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Leaderboards</h2>
              <span className="text-[11px] text-slate-400">tabs next</span>
            </div>

            <div className="space-y-2 text-[13px]">
              <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
                <div className="text-slate-200">Golden winners</div>
                <div className="mt-1 text-[12px] text-slate-400">Top by wins / USD</div>
                <GoldenWinnersLeaderboard refreshTick={refreshTick} />
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-6 text-center text-[12px] text-slate-500">
          USDDD - Zero Phase Public Testnet - Read-only - No wallets - No tracking
        </footer>
      </div>
    </main>
  );
}

