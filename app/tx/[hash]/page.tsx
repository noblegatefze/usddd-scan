export const dynamic = "force-dynamic";

function shortHash(h: string) {
  const s = (h ?? "").trim();
  if (s.length <= 16) return s;
  return `${s.slice(0, 10)}…${s.slice(-6)}`;
}

export default async function TxPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash: rawHash } = await params;
  const hash = decodeURIComponent(rawHash || "").trim();
  const isHex = /^0x[a-fA-F0-9]{64}$/.test(hash);

  // Your request: always BscScan
  const bscscan = isHex ? `https://bscscan.com/tx/${hash}` : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">USDDD Scan</div>
          <h1 className="mt-2 text-2xl font-semibold">Payment Transaction</h1>
          <p className="mt-2 text-[13px] text-slate-400">
            This page shows the on-chain transaction used to mark a Golden Find payout as paid.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] text-slate-400">Tx hash</div>
              <div className="mt-1 font-mono text-[13px] break-all text-slate-200">
                {hash || "-"}
              </div>
              <div className="mt-2 text-[12px] text-slate-500">
                {hash ? `Preview: ${shortHash(hash)}` : ""}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-900"
                onClick={() => {
                  if (!hash) return;
                  navigator.clipboard?.writeText(hash);
                }}
                disabled={!hash}
                title={!hash ? "No tx hash" : "Copy tx hash"}
              >
                Copy
              </button>

              <a
                href={bscscan ?? "#"}
                target="_blank"
                rel="noreferrer"
                className={`rounded-lg px-3 py-2 text-center text-[12px] font-semibold ${bscscan
                    ? "bg-slate-200 text-slate-950 hover:bg-white"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                  }`}
                aria-disabled={!bscscan}
                onClick={(e) => {
                  if (!bscscan) e.preventDefault();
                }}
                title={bscscan ? "Open on BscScan" : "Invalid tx hash"}
              >
                Open on BscScan
              </a>
            </div>
          </div>

          {!isHex && hash ? (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-[12px] text-amber-200">
              This doesn’t look like a standard BSC tx hash (expected 0x + 64 hex chars). Double-check what was saved in{" "}
              <span className="font-mono">paid_tx_hash</span>.
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <a
            href="/"
            className="text-[12px] text-slate-400 hover:text-slate-200 underline underline-offset-4 decoration-slate-700"
          >
            ← Back to Scan
          </a>
        </div>
      </div>
    </main>
  );
}
