"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

type Position = { id: string; position_ref: string; status: string; funded_usdt: number | string | null; deposit_tx_hash?: string | null; sweep_tx_hash?: string | null };
type Account = { username: string | null; positions: Position[] };
const pageSize = 10;
const pageButton = "rounded border border-cyan-800 px-2.5 py-1 text-xs text-cyan-100 disabled:opacity-40";
const accountOrigin = "https://usddd.digdug.do";
const units = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const links = [["Home","https://www.digdug.do/"],["Observatory",accountOrigin+"/"],["Surface Dispatch","https://feed.digdug.do/"],["Play Flatverse","https://play.digdug.do/"]];

export default function FundNetwork() {
  const [account, setAccount] = useState<Account | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    function receive(event: MessageEvent) {
      const frame = document.querySelector<HTMLIFrameElement>(".dd-account-frame");
      if (event.origin !== accountOrigin || !frame || event.source !== frame.contentWindow ||
          event.data?.type !== "flatverse-fund-positions" || !Array.isArray(event.data.positions)) return;
      setAccount({ username: typeof event.data.username === "string" ? event.data.username : null,
        positions: event.data.positions });
    }
    window.addEventListener("message", receive);
    document.querySelector<HTMLIFrameElement>(".dd-account-frame")?.contentWindow?.postMessage({type:"flatverse-refresh-profile"}, accountOrigin);
    return () => window.removeEventListener("message", receive);
  }, []);
  const active = account?.positions.filter(position => position.status !== "withdrawn" && Number(position.funded_usdt) > 0) ?? [];
  const funded = active.reduce((sum, position) => sum + Number(position.funded_usdt), 0);
  const positions = account?.positions ?? [];
  const lastPage = Math.max(0, Math.ceil(positions.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * pageSize;
  const rows = positions.slice(start, start + pageSize);
  function receipt(hash: string | null | undefined, label: string) {
    return hash && /^0x[\da-f]{64}$/i.test(hash)
      ? <a className="text-cyan-200 underline" href={"https://bscscan.com/tx/" + hash} target="_blank" rel="noreferrer">{label}</a>
      : null;
  }

  return <main className="min-h-screen bg-[#04111e] px-4 py-5 text-slate-100 sm:px-8">
    <div className="mx-auto grid max-w-[1420px] gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-700 bg-[#061c2d] px-4 py-3">
        <a href="https://fund.digdug.do/" className="text-xl font-black tracking-tight">DIGDUG.DO <span className="text-cyan-200">/ FUND NETWORK</span></a>
        <div className="dd-account-nav">
          <nav className="site-nav flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold" aria-label="Fund Network navigation">
            {links.map(([label, url]) => <a key={label} href={url} className="hover:text-cyan-200">{label}</a>)}
          </nav>
          <div data-explorer-account="" />
        </div>
      </header>
      <Script src="https://usddd.digdug.do/explorer-account.js" strategy="afterInteractive" />
      <section className="rounded-lg border border-cyan-700 bg-[#061c2d] bg-cover bg-center px-5 py-10 sm:p-12" style={{backgroundImage:"linear-gradient(90deg,#061524,#061524e8 48%,#06152455),url(https://www.digdug.do/flatverse-ice-wall.jpg)"}}>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Back the <span className="text-amber-300">Exploration</span></h1>
        <p className="mt-3 text-sm text-slate-200">View Fund positions linked to your Explorer account.</p>
      </section>
      <details className="rounded-lg border border-cyan-800 bg-[#061c2d] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-cyan-100">Manage deposits and withdrawals</summary>
        <div className="mt-3 grid gap-2 text-xs text-slate-300">
          <p>Open Fund tools to issue a deposit address, confirm a deposit, or request a withdrawal.</p>
          <a className="justify-self-start rounded border border-cyan-800 px-2.5 py-1.5 font-medium text-cyan-100" href="https://usddd.digdug.do/fund?legacy=1#positions" target="_blank" rel="noreferrer">Open Fund tools ↗</a>
        </div>
      </details>
      <details id="positions" open className="rounded-lg border border-cyan-800 bg-[#061c2d] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-cyan-100">Your positions</summary>
        <div className="mt-3">
        {account?.username ? <>
          <p className="mt-1 text-xs text-slate-300">Signed in as {account.username}</p>
          <dl className="my-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-md border border-slate-700 p-3"><dt className="text-xs text-slate-300">Active funded positions</dt><dd className="text-base font-semibold">{active.length}</dd></div>
            <div className="rounded-md border border-slate-700 p-3"><dt className="text-xs text-slate-300">Active funded amount</dt><dd className="text-base font-semibold">{units.format(funded)} USDT</dd></div>
          </dl>
          {positions.length ? <>
            <div className="overflow-x-auto"><table aria-label="Fund positions" className="w-full text-left text-xs">
              <thead><tr className="text-cyan-200"><th scope="col" className="py-1.5 pr-4">Reference</th><th scope="col" className="py-1.5 pr-4">Status</th><th scope="col" className="py-1.5 pr-4">Funded</th><th scope="col" className="py-1.5">Receipts</th></tr></thead>
              <tbody>{rows.map(position => <tr className="border-t border-slate-700" key={position.id}>
                <td className="whitespace-nowrap py-1.5 pr-4">{position.position_ref}</td>
                <td className="py-1.5 pr-4 capitalize">{position.status.replaceAll("_", " ")}</td>
                <td className="whitespace-nowrap py-1.5 pr-4">{units.format(Number(position.funded_usdt) || 0)} USDT</td>
                <td className="py-1.5"><div className="flex gap-2">{receipt(position.deposit_tx_hash, "Deposit")}{receipt(position.sweep_tx_hash, "Sweep")}</div></td>
              </tr>)}</tbody>
            </table></div>
            <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300" aria-label="Fund position pages">
              <span aria-live="polite">{start + 1}–{start + rows.length} of {positions.length} positions</span>
              <div className="flex items-center gap-2">
                <button type="button" className={pageButton} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
                <button type="button" className={pageButton} disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</button>
              </div>
            </nav>
          </> : <p className="text-xs text-slate-300">No positions are linked to this account.</p>}
        </> : <p className="mt-2 text-sm text-slate-300">Sign in using the Explorer account button at the top right to see your positions.</p>}
        </div>
      </details>

    </div>
  </main>;
}
