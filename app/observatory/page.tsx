import Link from "next/link";

export const metadata = { title: "Flatverse Observatory | DIGDUG.DO" };

const regions = ["Americas", "Arabian Peninsula", "Pacific"];
const metrics = ["Active diggers", "Extractions", "Golden signals", "Bots online"];
const panel = "rounded-2xl border border-sky-300/20 bg-[#10243a] p-5";

type Snapshot = {
  activeDiggers: number;
  bots: number;
  goldenSignals: number;
  leaderboard: { name: string; bot: boolean; score: number }[];
};

async function getSnapshot(): Promise<Snapshot | null> {
  try {
    const endpoint = process.env.FLATVERSE_SNAPSHOT_URL ?? (
      process.env.VERCEL_ENV === "production" ? "https://play.digdug.do/api/world" :
        "https://digdug-flatverse-deyjm2aam-dig-dug-do.vercel.app/api/world"
    );
    const response = await fetch(endpoint, { next: { revalidate: 10 }, signal: AbortSignal.timeout(3000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export default async function ObservatoryPage() {
  const snapshot = await getSnapshot();
  const values = [snapshot?.activeDiggers, undefined, snapshot?.goldenSignals, snapshot?.bots];
  return (
    <main className="min-h-screen bg-[#081522] text-[#e8f4ff]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-10 sm:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-300/20 pb-5">
          <span className="font-mono text-sm tracking-widest text-sky-200">DIGDUG.DO</span>
          <nav aria-label="Observatory" className="flex flex-wrap gap-4 text-sm text-sky-200">
            <Link href="/zero-phase-archive">Zero Phase Archive</Link>
            <Link href="/fund">Fund Network</Link>
          </nav>
        </header>
        <section className="py-8">
          <p className="font-mono text-xs uppercase tracking-widest text-sky-200">Practice World · Simulated rewards</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Flatverse Observatory</h1>
          <p className="mt-4 max-w-xl text-slate-300">Track exploration across the Practice World and browse the original Zero Phase records.</p>
          <a className="mt-5 inline-block rounded-md bg-amber-300 px-4 py-2 font-semibold text-slate-950" href="https://play.digdug.do/">Enter Flatverse</a>
        </section>
        <section aria-label="Practice World activity">
          {!snapshot && <p className="mb-3 text-sm text-slate-300">Practice activity is temporarily unavailable.</p>}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((label, index) => (
              <div className={panel} key={label}>
                <dt className="text-sm text-sky-200">{label}</dt>
                <dd className="mt-2 font-mono text-2xl" >{values[index] ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={panel + " mt-6"}>
          <h2 className="text-xl font-semibold">Flatverse terrain</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {regions.map((region, index) => (
              <li key={region} className="overflow-hidden rounded-lg border border-sky-300/20 bg-[#0b1a2c] p-3">
                <div aria-hidden="true" className="mb-3 h-20 bg-gradient-to-br from-sky-200 to-sky-900" style={{ clipPath: ["polygon(0 85%, 12% 47%, 31% 51%, 45% 10%, 65% 29%, 78% 17%, 100% 73%, 78% 86%, 48% 70%, 21% 93%)", "polygon(0 65%, 21% 18%, 38% 30%, 55% 10%, 72% 45%, 94% 38%, 100% 80%, 66% 92%, 48% 68%, 26% 87%)", "polygon(0 58%, 18% 38%, 39% 50%, 53% 22%, 68% 40%, 89% 8%, 100% 46%, 81% 66%, 63% 63%, 43% 90%, 20% 72%)"][index] }} />
                <span className="font-medium">{region}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className={panel}><h2 className="text-lg font-semibold">Recent finds</h2><p className="mt-2 text-sm text-slate-300">The activity feed is pending in this preview.</p></section>
          <section className={panel}><h2 className="text-lg font-semibold">Practice leaderboard</h2><p className="mt-2 text-sm text-slate-300">Scores are simulated.</p>{snapshot?.leaderboard.length ? <ol className="mt-3 divide-y divide-sky-300/20">{snapshot.leaderboard.map((actor, index) => <li key={index} className="flex justify-between gap-3 py-2 text-sm"><span>{actor.name}{actor.bot && <span className="ml-2 text-xs text-sky-200">Bot</span>}</span><span className="font-mono">${(actor.score / 100).toFixed(2)}</span></li>)}</ol> : <p className="mt-3 text-sm text-slate-300">No standings available.</p>}<a className="mt-3 inline-block text-sky-200 underline" href="https://play.digdug.do/">Open Flatverse</a></section>
        </div>
        <section className={panel + " mt-6"}>
          <h2 className="text-lg font-semibold">Zero Phase Archive</h2>
          <p className="mt-2 text-sm text-slate-300">Browse historical Golden Finds, payouts, sponsor box balances, and protocol activity.</p>
          <Link className="mt-3 inline-block text-sky-200 underline" href="/zero-phase-archive">Open archive</Link>
        </section>
      </div>
    </main>
  );
}
