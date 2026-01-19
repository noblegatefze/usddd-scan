"use client";

import Image from "next/image";
import React from "react";

type ActivityResp = {
  window: { start: string; end: string; hours: number };
  counts: {
    claims: number;
    unique_claimers: number;
    ledger_entries: number;
    claim_reserves: number;
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
};

type BoxBalanceRow = {
  box: string;
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

function relTime(ts: string | null) {
  if (!ts) return "—";
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

function NetworkActivityCard() {
  const [data, setData] = React.useState<ActivityResp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/activity/24h", { cache: "no-store" });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        if (!cancelled) setData(json as ActivityResp);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const c = data.counts;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="text-[12px] text-slate-400">Claims (24h)</div>
          <div className="mt-1 text-base font-semibold">{fmt(c.claims)}</div>
        </div>

        <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="text-[12px] text-slate-400">Unique claimers (24h)</div>
          <div className="mt-1 text-base font-semibold">{fmt(c.unique_claimers)}</div>
        </div>

        <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="text-[12px] text-slate-400">Ledger entries (24h)</div>
          <div className="mt-1 text-base font-semibold">{fmt(c.ledger_entries)}</div>
        </div>

        <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[12px] text-slate-400">Claim reserves (24h)</div>
              <div className="mt-1 text-base font-semibold">{fmt(c.claim_reserves)}</div>
            </div>
            <div className="text-[11px] text-slate-500">window: {data.window.hours}h</div>
          </div>
        </div>
      </div>

      {data.warnings && data.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-[12px] text-amber-200">
          <div className="font-semibold text-amber-200/90">Warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.warnings.map((w, i) => (
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

function LatestGoldenFindsTable() {
  const [rows, setRows] = React.useState<GoldenFindRow[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/golden-finds/latest?limit=10", { cache: "no-store" });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        const dataRows = (json?.rows ?? []) as GoldenFindRow[];
        if (!cancelled) setRows(dataRows);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
                  <td className="py-2 pr-2 font-mono text-slate-200 truncate">{r.claim ?? "—"}</td>
                  <td className="py-2 pr-2 truncate">{r.winner}</td>
                  <td className="hidden sm:table-cell py-2 pr-2 truncate">{r.token ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">{fmtUsd(r.usd ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoxBalancesTable() {
  const [rows, setRows] = React.useState<BoxBalanceRow[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/boxes/balances?limit=10", { cache: "no-store" });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        const dataRows = (json?.rows ?? []) as BoxBalanceRow[];
        if (!cancelled) setRows(dataRows);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
                  <td className="py-2 pr-2 font-mono truncate">{r.box}</td>
                  <td className="hidden sm:table-cell py-2 pr-2 text-right text-slate-300">
                    {fmtDec(r.deposited)}
                  </td>
                  <td className="hidden sm:table-cell py-2 pr-2 text-right text-slate-300">
                    {fmtDec(r.claimed)}
                  </td>
                  <td className="hidden md:table-cell py-2 pr-2 text-right text-slate-300">
                    {fmtDec(r.withdrawn)}
                  </td>
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

function GoldenWinnersLeaderboard() {
  const [rows, setRows] = React.useState<GoldenWinnersRow[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/leaderboards/golden-winners?limit=5", { cache: "no-store" });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        const dataRows = (json?.rows ?? []) as GoldenWinnersRow[];
        if (!cancelled) setRows(dataRows);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
            <div className="mt-1 text-[12px] text-slate-400">
              Wins: {fmt(r.wins)}
            </div>
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

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
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

          <div className="hidden md:flex flex-1 justify-center">
            <div className="w-[520px] rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[13px] text-slate-300">
              Search claim code / box / user…
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
              Testnet
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
            <span>Version: v0.1.16.0</span>
            <span className="text-slate-600">·</span>
            <span>Build: f72640a</span>
            <span className="text-slate-600">·</span>
            <span>Updated: 12s ago</span>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <a
                href="https://digdug.do"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
              >
                Open Terminal
              </a>
              <a
                href="#"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
              >
                Telegram
              </a>
              <a
                href="https://github.com/noblegatefze/digdug-whitepaper"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/70"
              >
                Docs
              </a>
            </div>
          </div>
        </div>

        <div className="md:hidden border-t border-slate-800/40 px-4 py-2">
          <div className="w-full rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-[13px] text-slate-300">
            Search claim code / box / user…
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-4 md:grid-cols-12">
          <section className="md:col-span-6 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Network Activity (24h)</h2>
              <span className="text-[11px] text-slate-400">live</span>
            </div>
            <NetworkActivityCard />
          </section>

          <section className="md:col-span-6 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Latest Golden Finds</h2>
              <a href="#" className="text-[11px] text-slate-400 hover:text-slate-200">
                View all
              </a>
            </div>

            <LatestGoldenFindsTable />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="text-[12px] text-slate-400">Use the Terminal to DIG and earn rewards.</div>
              <a
                href="https://digdug.do"
                target="_blank"
                rel="noreferrer"
                className="ml-auto rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
              >
                Open Terminal
              </a>
              <a
                href="#"
                className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
              >
                Join Telegram
              </a>
            </div>
          </section>

          <section className="md:col-span-8 rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Box Balances</h2>
              <a href="#" className="text-[11px] text-slate-400 hover:text-slate-200">
                View all
              </a>
            </div>

            <BoxBalancesTable />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="text-[12px] text-slate-400">Deploy a box, fund rewards, gain exposure.</div>
              <a
                href="https://digdug.do"
                target="_blank"
                rel="noreferrer"
                className="ml-auto rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-950/70"
              >
                Become a Sponsor
              </a>
              <a
                href="https://github.com/noblegatefze/digdug-whitepaper"
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
                <GoldenWinnersLeaderboard />
              </div>

              <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
                <div className="text-slate-200">Top diggers</div>
                <div className="mt-1 text-[12px] text-slate-400">Anon installs</div>
              </div>

              <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
                <div className="text-slate-200">Top spend</div>
                <div className="mt-1 text-[12px] text-slate-400">USDDD spent</div>
              </div>

              <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
                <div className="text-slate-200">Top rewards</div>
                <div className="mt-1 text-[12px] text-slate-400">USD earned</div>
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-6 text-center text-[12px] text-slate-500">
          USDDD · Zero Phase Public Testnet · Read-only · No wallets · No tracking
        </footer>
      </div>
    </main>
  );
}
