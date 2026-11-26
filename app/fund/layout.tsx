import { headers } from "next/headers";
import type { ReactNode } from "react";

export const metadata = { title: "Fund Network | DIGDUG.DO" };

export default async function FundLayout({ children }: { children: ReactNode }) {
  const host = (await headers()).get("host");
  if (host !== "fund.digdug.do") return children;

  return <>
    {children}
    <aside className="bg-[#04111e] px-5 py-4 text-sm text-cyan-200">
      <a className="underline" href="https://usddd.digdug.do/fund?legacy=1#positions">Open positions previously saved in this browser</a>
    </aside>
  </>;
}
