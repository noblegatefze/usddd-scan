"use client";

import Link from "next/link";
import React, { useState } from "react";

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


function LatestGoldenFindsTable({
  refreshTick,
  onOpenPayout,
}: {
  refreshTick: number;
  onOpenPayout: (claim: string | null | undefined) => void;
}) {
  const [rows, setRows] = React.useState<GoldenFindRow[] | null>(null);
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
    <div className="-mx-4 overflow-x-auto">
      <div className="px-4">
        <table className="w-full min-w-[560px] table-fixed text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-400">
            <tr className="border-b border-slate-800/60">
              <th className="w-[145px] py-2 pr-2">Recorded time</th>
              <th className="w-[96px] py-2 pr-2">Claim</th>
              <th className="py-2 pr-2">Winner</th>
              <th className="w-[90px] py-2 pr-2">Token</th>
              <th className="w-[64px] py-2 text-right">USD</th>
            </tr>
          </thead>

          <tbody className="text-slate-200">
            {!rows?.length ? (
              <tr className="border-b border-slate-800/40">
                <td className="py-3 text-slate-400" colSpan={5}>
                  {rows ? "No records found." : "Loading…"}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.claim ?? `${r.ts}-${r.token}`} className="border-b border-slate-800/40">
                  <td className="py-2 pr-2 text-slate-300">{fmtTs(r.ts)}</td>
                  <td className="py-2 pr-2 font-mono text-slate-200 truncate">{r.claim ?? "-"}</td>
                  <td className="py-2 pr-2 truncate">{r.winner}</td>
                  <td className="py-2 pr-2 truncate">{r.token ?? "-"}</td>
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
  const [rows, setRows] = React.useState<BoxBalanceRow[] | null>(null);
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
    <div className="-mx-4 overflow-x-auto">
      <div className="px-4">
        <table className="w-full min-w-[560px] table-fixed text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-400">
            <tr className="border-b border-slate-800/60">
              <th className="w-[90px] py-2 pr-2">Box</th>
              <th className="w-[90px] py-2 pr-2 text-right">Deposited</th>
              <th className="w-[90px] py-2 pr-2 text-right">Claimed</th>
              <th className="w-[90px] py-2 pr-2 text-right">Withdrawn</th>
              <th className="w-[88px] py-2 text-right">Remaining</th>
            </tr>
          </thead>

          <tbody>
            {!rows?.length ? (
              <tr className="border-b border-slate-800/40">
                <td className="py-3 text-slate-400" colSpan={5}>
                  {rows ? "No records found." : "Loading…"}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.box} className="border-b border-slate-800/40">
                  <td className="py-2 pr-2 font-mono truncate text-slate-200">{r.box}</td>
                  <td className="py-2 pr-2 text-right text-slate-300">{fmtDec(r.deposited)}</td>
                  <td className="py-2 pr-2 text-right text-slate-300">{fmtDec(r.claimed)}</td>
                  <td className="py-2 pr-2 text-right text-slate-300">{fmtDec(r.withdrawn)}</td>
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
  const [rows, setRows] = React.useState<GoldenWinnersRow[] | null>(null);
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

  if (!rows?.length) {
    return <div className="mt-2 text-[12px] text-slate-400">{rows ? "No records found." : "Loading…"}</div>;
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

        {/* Only the body scrolls */}
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

function PayoutModalBody({ claim }: { claim: string | null }) {
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
        const res = await fetch(`/api/golden-finds/payment?claim=${encodeURIComponent(claim)}`);
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

  if (!claim) {
    return <div className="text-[13px] text-slate-400">No claim selected.</div>;
  }

  if (loading && !data) {
    return <div className="text-[13px] text-slate-400">Loading payout…</div>;
  }

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
          className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${bscTx ? "bg-slate-200 text-slate-950 hover:bg-white" : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          aria-disabled={!bscTx}
          onClick={(e) => {
            if (!bscTx) e.preventDefault();
          }}
        >
          Open on BscScan ↗
        </a>

      </div>

      <div className="text-[12px] text-slate-500">
        Note: BscScan shows the on-chain sender/recipient details. These details were recorded during Zero Phase.
      </div>
    </div>
  );
}


export default function ZeroPhaseRecords() {
  const [claim, setClaim] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  return (
    <main className="min-h-screen bg-[#04111e] px-3 py-5 text-[#f6fbff] sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-cyan-400 bg-[#051c2c] px-5 py-4">
          <Link href="/" className="text-xl font-extrabold hover:underline">DIGDUG.DO <span className="text-cyan-200">Flatverse</span></Link>
          <nav aria-label="Flatverse" className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-semibold">
            <Link href="/" className="hover:underline">Observatory</Link>
            <Link href="/fund" className="hover:underline">Fund Network</Link>
            <a href="https://www.digdug.do/surface-dispatch" className="hover:underline">Surface Dispatch</a>
            <a href="https://play.digdug.do/" className="rounded-md bg-[#ffcb29] px-3 py-2 text-[#07121b] hover:bg-[#ffdf6f]">Play Flatverse</a>
          </nav>
        </header>

        <section className="rounded-lg border border-cyan-400 bg-[#051c2c] p-5 sm:p-8">
          <h1 className="text-3xl font-extrabold sm:text-5xl">Zero Phase Archive</h1>
          <p className="mt-3 text-cyan-100">Browse read-only records from the Zero Phase testnet.</p>
          <button type="button" onClick={() => setRefreshTick((tick) => tick + 1)} className="mt-4 rounded-md border border-cyan-400 px-3 py-2 text-sm font-semibold hover:bg-cyan-950">Refresh records</button>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="min-w-0 rounded-lg border border-cyan-600 bg-[#051c2c] p-4 lg:col-span-2">
            <h2 className="mb-3 text-lg font-bold">Golden finds and payouts</h2>
            <LatestGoldenFindsTable refreshTick={refreshTick} onOpenPayout={(code) => setClaim(code?.trim() || null)} />
          </section>
          <section className="min-w-0 rounded-lg border border-cyan-600 bg-[#051c2c] p-4">
            <h2 className="mb-3 text-lg font-bold">Golden winners</h2>
            <GoldenWinnersLeaderboard refreshTick={refreshTick} />
          </section>
          <section className="min-w-0 rounded-lg border border-cyan-600 bg-[#051c2c] p-4 lg:col-span-3">
            <h2 className="mb-3 text-lg font-bold">Treasure box balances</h2>
            <BoxBalancesTable refreshTick={refreshTick} />
          </section>
        </div>
      </div>
      <ScanModal open={Boolean(claim)} title="Zero Phase payout record" onClose={() => setClaim(null)}>
        <PayoutModalBody claim={claim} />
      </ScanModal>
    </main>
  );
}
