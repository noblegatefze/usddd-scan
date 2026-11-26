"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

type Position = { id: string; position_ref: string; status: string; funded_usdt: number | string | null };
type Account = { username: string | null; positions: Position[] };
const accountOrigin = "https://usddd.digdug.do";
const units = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const links = [["Home","https://www.digdug.do/"],["Observatory",accountOrigin+"/"],["Surface Dispatch","https://feed.digdug.do/"],["Play Flatverse","https://play.digdug.do/"]];

export default function FundNetwork() {
  const [account, setAccount] = useState<Account | null>(null);
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
      <section id="positions" className="rounded-lg border border-cyan-800 bg-[#061c2d] p-5" aria-labelledby="positions-heading">
        <h2 id="positions-heading" className="text-xl font-bold">Your positions</h2>
        {account?.username ? <>
          <p className="mt-1 text-sm text-slate-300">Signed in as {account.username}</p>
          <dl className="my-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-md border border-slate-700 p-3"><dt className="text-xs text-slate-300">Active funded positions</dt><dd className="text-2xl font-semibold">{active.length}</dd></div>
            <div className="rounded-md border border-slate-700 p-3"><dt className="text-xs text-slate-300">Active funded amount</dt><dd className="text-2xl font-semibold">{units.format(funded)} USDT</dd></div>
          </dl>
          {account.positions.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr className="text-cyan-200"><th scope="col" className="py-2 pr-4">Reference</th><th scope="col" className="py-2 pr-4">Status</th><th scope="col" className="py-2">Funded</th></tr></thead>
            <tbody>{account.positions.map(position => <tr className="border-t border-slate-700" key={position.id}><td className="py-2 pr-4">{position.position_ref}</td><td className="py-2 pr-4 capitalize">{position.status.replaceAll("_", " ")}</td><td className="py-2">{units.format(Number(position.funded_usdt) || 0)} USDT</td></tr>)}</tbody>
          </table></div> : <p className="text-sm text-slate-300">No positions are linked to this account.</p>}
        </> : <p className="mt-2 text-sm text-slate-300">Sign in using the Explorer account button at the top right to see your positions.</p>}
      </section>
      <a className="justify-self-start text-xs text-cyan-200 underline" href="https://usddd.digdug.do/fund?legacy=1#positions">Legacy Fund actions and positions saved in this browser</a>
    </div>
  </main>;
}
