import Link from "next/link";

export const metadata = { title: "Flatverse Observatory | DIGDUG.DO" };

type Snapshot = {
  activeDiggers: number;
  bots: number;
  goldenSignals: number;
  leaderboard: { name: string; bot: boolean; score: number }[];
};

async function getSnapshot(): Promise<Snapshot | null> {
  try {
    const endpoint = process.env.FLATVERSE_SNAPSHOT_URL ?? "https://play.digdug.do/api/world";
    const response = await fetch(endpoint, { next: { revalidate: 10 }, signal: AbortSignal.timeout(3000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const dispatch = "https://www.digdug.do/surface-dispatch";
const play = "https://play.digdug.do/";

export default async function ObservatoryPage() {
  const snapshot = await getSnapshot();
  const metrics = [
    { label: "Active diggers", icon: "◉", value: snapshot?.activeDiggers },
    { label: "Extractions", icon: "⛏", value: undefined },
    { label: "Golden signals", icon: "◆", value: snapshot?.goldenSignals },
    { label: "Bots online", icon: "▣", value: snapshot?.bots },
  ];
  return (
    <main className="ob">
      <style>{"\n.ob{min-height:100vh;background:#04111e;color:#f6fbff;font:16px/1.4 Arial,Helvetica,sans-serif;padding:20px clamp(12px,3vw,48px) 42px}.ob *{box-sizing:border-box}.ob a{color:inherit;text-decoration:none}.ob a:hover{text-decoration:underline}.ob a:focus-visible{outline:3px solid #ffcb29;outline-offset:3px}.ob h1,.ob h2,.ob p,.ob dl,.ob dd,.ob ol{margin:0}.ob-shell{max-width:1420px;margin:auto}.ob-head,.ob-hero,.ob-panel,.ob-stat{border:1px solid #3dd9ef;background:#051c2c;border-radius:7px}.ob-head{display:flex;align-items:center;justify-content:space-between;gap:13px;padding:12px 18px;flex-wrap:wrap}.ob-brand{font-weight:900;font-size:clamp(19px,2.4vw,31px);letter-spacing:-.035em}.ob-brand span{color:#7defff;font-size:.71em}.ob-nav{display:flex;gap:8px 16px;align-items:center;flex-wrap:wrap;font-size:14px;font-weight:700}.ob .ob-play{background:linear-gradient(#ffdc54,#ffb400);color:#07121b;border:1px solid #ffeb9e;padding:7px 13px;border-radius:6px;font-weight:900;text-align:center}.ob-hero{margin-top:10px;min-height:clamp(210px,24vw,320px);display:flex;justify-content:center;flex-direction:column;padding:clamp(16px,3vw,38px);background:linear-gradient(90deg,#031222ee,#03122266 58%,transparent),url('/flatverse-observatory.jpg') center 50%/cover no-repeat #061a2f}.ob-hero h1{font-size:clamp(34px,5.5vw,73px);line-height:.94;letter-spacing:-.05em;max-width:14ch}.ob-hero h1 span{color:#54f0ff}.ob-hero p{margin-top:13px;font-weight:700}.ob-hero p::before{content:\"\";display:inline-block;width:6px;height:1em;background:#ffc326;margin-right:9px;vertical-align:-1px}.ob-stats{margin-top:10px!important;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.ob-stat{display:flex;align-items:center;gap:13px;padding:9px 13px;min-width:0}.ob-stat i{font-style:normal;font-weight:900;color:#40e9fa;font-size:27px;line-height:1}.ob-stat dt{font-size:14px;line-height:1.15}.ob-stat dd{font-size:clamp(22px,3vw,36px);font-weight:900;line-height:1.15}.ob-grid{margin-top:10px;display:grid;grid-template-columns:minmax(0,2.1fr) minmax(0,1fr);gap:10px}.ob-panel{padding:11px 13px;min-width:0}.ob-panel h2{font-size:clamp(19px,2vw,27px);line-height:1.15;letter-spacing:-.025em;padding-bottom:7px;border-bottom:1px solid #4c9eb2}.ob-panel h2 small{font-size:.57em;font-weight:400;letter-spacing:0}.ob-map{margin:9px -7px -5px;position:relative;aspect-ratio:1.68;background:url('/flatverse-mine-cross-section.jpg') center 53%/cover no-repeat #031324;overflow:hidden;border-radius:4px}.ob-regions{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);text-align:center;padding-top:9px;font-weight:800;font-size:clamp(13px,2.1vw,26px);line-height:1.05}.ob-regions span+span{border-left:1px dashed #5defff66}.ob-regions span::after{content:\"\";margin:7px auto 0;display:block;width:8px;height:8px;border-radius:50%;background:#73f7ff;box-shadow:0 0 9px #60efff}.ob-side{display:grid;gap:10px;align-content:start}.ob-panel p{margin-top:8px;color:#c1d9e7;font-size:14px}.ob-board{list-style:none;padding:0}.ob-board li{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid #28546a;font-size:14px}.ob-board li:last-child{border-bottom:0}.ob-bot{display:inline-block;margin-left:6px;background:#52ebf9;color:#07202b;font-size:11px;font-weight:900;padding:1px 5px;border-radius:3px}.ob-lower{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.ob-lower a{display:block;font-weight:800;font-size:19px}.ob-lower p{margin-top:3px}.ob-state{padding-top:8px;font-size:13px;color:#d1e5ee}\n@media(max-width:760px){.ob{padding:9px 10px 25px}.ob-head{padding:8px 10px}.ob-nav{gap:7px 12px;font-size:12px}.ob-nav .ob-play{width:100%}.ob-hero{min-height:164px;background-position:70% 53%}.ob-hero h1{font-size:clamp(31px,9vw,47px)}.ob-hero p{font-size:12px;margin-top:8px}.ob-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ob-stat{padding:8px 9px;gap:8px}.ob-stat i{font-size:22px}.ob-stat dt{font-size:12px}.ob-grid,.ob-lower{grid-template-columns:1fr}.ob-map{aspect-ratio:1.7}.ob-board li{font-size:13px}}\n"}</style>
      <div className="ob-shell">
        <header className="ob-head">
          <a href="https://www.digdug.do/" className="ob-brand">DIGDUG.DO <span>/ USDDD SCAN</span></a>
          <nav className="ob-nav" aria-label="Observatory">
            <a href={dispatch}>Surface Dispatch</a><Link href="/zero-phase-archive">Zero Phase Archive</Link><Link href="/fund">Fund Network</Link><a className="ob-play" href={play}>Play Flatverse</a>
          </nav>
        </header>
        <section className="ob-hero"><h1>Flatverse <span>Observatory</span></h1><p>Practice World · Simulated rewards</p></section>
        {!snapshot && <p className="ob-state" role="status">Practice activity is temporarily unavailable.</p>}
        <dl className="ob-stats" aria-label="Practice World activity">
          {metrics.map(({label, icon, value}) => <div className="ob-stat" key={label}><i aria-hidden="true">{icon}</i><div><dt>{label}</dt><dd>{value ?? <span aria-label="Unavailable">—</span>}</dd></div></div>)}
        </dl>
        <div className="ob-grid">
          <section className="ob-panel">
            <h2>World map <small>· Flatverse mine cross-section</small></h2>
            <div className="ob-map" aria-label="Illustrated cross-section of the Flatverse mine"><div className="ob-regions"><span>Americas</span><span>Arabian<br/>Peninsula</span><span>Pacific</span></div></div>
          </section>
          <div className="ob-side">
            <section className="ob-panel"><h2>Recent finds</h2><p>The live extraction feed is pending.</p></section>
            <section className="ob-panel"><h2>Practice leaderboard</h2>
              {snapshot?.leaderboard.length ? <ol className="ob-board">{snapshot.leaderboard.slice(0, 5).map((actor, index) => <li key={index}><span>{index + 1}.</span><span>{actor.name}{actor.bot && <span className="ob-bot">Bot</span>}</span><strong>${(actor.score / 100).toFixed(2)}</strong></li>)}</ol> : <p>No standings available.</p>}
            </section>
          </div>
        </div>
        <div className="ob-lower">
          <section className="ob-panel"><a href={dispatch}>From Surface Dispatch ›</a><p>Flatverse Practice World is open.</p></section>
          <section className="ob-panel"><Link href="/zero-phase-archive">Zero Phase Archive ›</Link><p>Claims · Golden Finds · Sponsor boxes</p></section>
        </div>
      </div>
    </main>
  );
}
