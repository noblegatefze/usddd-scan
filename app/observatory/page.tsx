import Image from "next/image";
import Link from "next/link";
import LiveRefresh from "./live-refresh";

export const metadata = { title: "Flatverse Observatory | DIGDUG.DO" };

type Snapshot = {
  activeDiggers: number;
  bots: number;
  goldenSignals: number;
  updatedAt?: number;
  worldActive?: boolean;
  lastWorldTick?: number | null;
  regions?: { active: number; golden: number }[];
  captures24h?: { extractions: number; finds: number; valueCents: number; goldenFinds?: number; trackingSince: number; tokens: { symbol: string; amount: string }[] } | null;
  recentFinds?: { at: number; tokens: { symbol: string; amount: string; usdCents: number | null }[] }[];
  leaderboard: { name: string; bot: boolean; score: number; runs?: number }[];
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

const tokenLogos: Record<string, string> = {
  "BONK": "https://www.datocms-assets.com/107373/1762535859-bonk-logo-photoshop.png",
  "CAKE": "https://s2.coinmarketcap.com/static/img/coins/64x64/7186.png",
  "FARTCOIN": "https://s2.coinmarketcap.com/static/img/coins/64x64/33597.png",
  "GMX": "https://s3.coinmarketcap.com/static-gravity/image/b061524525524183a2dd28f4a4447b3f.png",
  "GRASS": "https://img.bitgetimg.com/multiLang/coinPriceLogo/grass.jpeg",
  "JUP": "https://images.seeklogo.com/logo-png/60/1/jupiter-jup-logo-png_seeklogo-609611.png",
  "RIVER": "https://appeco.galxe.com/galxe/space/logo/tooljet/1747971757541-River-icon-1.png",
  "SAND": "https://s2.coinmarketcap.com/static/img/coins/64x64/6210.png",
  "USDDD": "https://node1.irys.xyz/VgrQwzSwqrwi_lElCIaM3UUf7Jv627Nqe5h5iZNb8RI",
  "VSN": "https://cdn.bitpanda.com/logos/v4/asset/light/1f051b7c-5980-6dda-9d3d-cf107d8d4bfb.png?t=3",
  "ZAMA": "https://a.storyblok.com/f/176646/512x512/d9d1cbda2b/zama.png"
};
const usdddContract = "0x03f65216F340bAC39c8d1911288B1c7CA071e9c3";
const dispatch = "https://www.digdug.do/surface-dispatch";
const play = "https://play.digdug.do/";
const timestamp = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function ObservatoryPage() {
  const snapshot = await getSnapshot();
  const recentFinds = snapshot?.recentFinds ?? [];
  const captures = snapshot?.captures24h;
  const partialWindow = captures && (snapshot?.updatedAt ?? Date.now()) - captures.trackingSince < 86400000;
  const metrics = [
    { label: "Active explorers now", icon: "◉", value: snapshot ? snapshot.activeDiggers + snapshot.bots : undefined },
    { label: partialWindow ? "Recorded extractions · last 24h" : "Extractions · last 24h", icon: "⛏", value: captures?.extractions },
    { label: "Golden Finds · last 24h", icon: "◆", value: captures?.goldenFinds },
    { label: "Golden signals now", icon: "◇", value: snapshot?.goldenSignals },
  ];
  return (
    <main className="ob">
      <LiveRefresh />
      <style>{".ob-token-totals{list-style:none;padding:0;margin:7px 0 0}.ob-token-totals li{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;padding:4px 0;border-bottom:1px solid #315264}\n.ob{min-height:100vh;background:#04111e;color:#f6fbff;font:16px/1.4 Arial,Helvetica,sans-serif;padding:20px clamp(12px,3vw,48px) 42px}.ob *{box-sizing:border-box}.ob a{color:inherit;text-decoration:none}.ob a:hover{text-decoration:underline}.ob a:focus-visible{outline:3px solid #ffcb29;outline-offset:3px}.ob h1,.ob h2,.ob p,.ob dl,.ob dd,.ob ol{margin:0}.ob-shell{max-width:1420px;margin:auto}.ob-head,.ob-hero,.ob-panel,.ob-stat{border:1px solid #3dd9ef;background:#051c2c;border-radius:7px}.ob-head{display:flex;align-items:center;justify-content:space-between;gap:13px;padding:12px 18px;flex-wrap:wrap}.ob-brand{font-weight:900;font-size:clamp(19px,2.4vw,31px);letter-spacing:-.035em}.ob-brand span{color:#7defff;font-size:.71em}.ob-nav{display:flex;gap:8px 16px;align-items:center;flex-wrap:wrap;font-size:14px;font-weight:700}.ob .ob-play{background:linear-gradient(#ffdc54,#ffb400);color:#07121b;border:1px solid #ffeb9e;padding:7px 13px;border-radius:6px;font-weight:900;text-align:center}.ob-testnet{color:#7ff3a3;white-space:nowrap}.ob .ob-play-large{display:flex;align-items:center;justify-content:center;gap:10px;min-height:68px;font-size:clamp(20px,2vw,28px)}.ob-hero{margin-top:10px;min-height:clamp(210px,24vw,320px);display:flex;justify-content:center;flex-direction:column;padding:clamp(16px,3vw,38px);background:linear-gradient(90deg,#031222ee,#03122266 58%,transparent),url('/flatverse-observatory.jpg') center 50%/cover no-repeat #061a2f}.ob-hero h1{font-size:clamp(34px,5.5vw,73px);line-height:.94;letter-spacing:-.05em;max-width:14ch}.ob-hero h1 span{color:#54f0ff}.ob-hero p{margin-top:13px;font-weight:700}.ob-hero p::before{content:\"\";display:inline-block;width:6px;height:1em;background:#ffc326;margin-right:9px;vertical-align:-1px}.ob-stats{margin-top:10px!important;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.ob-stat{display:flex;align-items:center;gap:13px;padding:9px 13px;min-width:0}.ob-stat i{font-style:normal;font-weight:900;color:#40e9fa;font-size:27px;line-height:1}.ob-stat dt{font-size:14px;line-height:1.15}.ob-stat dd{font-size:clamp(22px,3vw,36px);font-weight:900;line-height:1.15}.ob-grid{margin-top:10px;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:10px;align-items:start}.ob-panel{padding:11px 13px;min-width:0}.ob-panel h2{font-size:clamp(19px,2vw,27px);line-height:1.15;letter-spacing:-.025em;padding-bottom:7px;border-bottom:1px solid #4c9eb2}.ob-panel h2 small{font-size:.57em;font-weight:400;letter-spacing:0}.ob-map{margin:9px -7px 0;position:relative;aspect-ratio:2.16;background:url('/flatverse-mine-cross-section.jpg') center 53%/cover no-repeat #031324;overflow:hidden;border-radius:4px}.ob-regions{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);text-align:center;padding-top:9px;font-weight:800;font-size:clamp(13px,2.1vw,26px);line-height:1.05}.ob-regions span+span{border-left:1px dashed #5defff66}.ob-regions span::after{content:\"\";margin:7px auto 0;display:block;width:8px;height:8px;border-radius:50%;background:#73f7ff;box-shadow:0 0 9px #60efff}.ob-panel p{margin-top:8px;color:#c1d9e7;font-size:14px}.ob-board{list-style:none;padding:0}.ob-board li{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid #28546a;font-size:14px}.ob-board li:last-child{border-bottom:0}.ob-bot{display:inline-block;margin-left:6px;background:#52ebf9;color:#07202b;font-size:11px;font-weight:900;padding:1px 5px;border-radius:3px}.ob-side,.ob-lower{display:grid;gap:10px;min-width:0}.ob-lower{grid-template-columns:repeat(2,minmax(0,1fr))}.ob-extractions{margin-top:16px}.ob-lower a{display:block;font-weight:800;font-size:19px}.ob-lower p{margin-top:3px}.ob-state{padding-top:8px;font-size:13px;color:#d1e5ee}\n@media(max-width:760px){.ob{padding:9px 10px 25px}.ob-head{padding:8px 10px}.ob-nav{gap:7px 12px;font-size:12px}.ob-nav .ob-play{width:100%}.ob-hero{min-height:164px;background-position:70% 53%}.ob-hero h1{font-size:clamp(31px,9vw,47px)}.ob-hero p{font-size:12px;margin-top:8px}.ob-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ob-stat{padding:8px 9px;gap:8px}.ob-stat i{font-size:22px}.ob-stat dt{font-size:12px}.ob-grid,.ob-lower{grid-template-columns:minmax(0,1fr)}.ob-regions{font-size:clamp(11px,3.2vw,18px)}.ob-map{aspect-ratio:1.85}.ob-board li{font-size:13px}}\n"}</style>
      <style>{".ob-finds{list-style:none;padding:0}.ob-finds li{border-top:1px solid #225264;padding:8px 0;overflow-wrap:anywhere}.ob-finds time{display:block;color:#acd1de;font-size:.8rem}"}</style>
      <style>{".ob{font-family:var(--font-geist-sans),system-ui,sans-serif}.ob-hero h1{font-size:clamp(37px,6vw,82px);font-weight:900;line-height:.95;letter-spacing:-.058em;text-shadow:0 3px 22px #020c18}.ob-hero h1 span{display:block}.ob-panel h2{font-weight:750}.ob-testnet{display:inline-flex;align-items:center;gap:5px;padding:3px 6px;border:1px solid #246893;border-radius:5px;background:#031323;color:#5bff5f;box-shadow:inset 0 1px #84e9ff42,inset 0 -3px #05112285;font-size:10px;line-height:1;font-weight:900;letter-spacing:.045em;text-transform:uppercase}.ob-testnet::before{content:'';width:.5em;height:.5em;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor}.ob-token-name{display:inline-flex;align-items:center;gap:8px;font-weight:650}.ob-token-name img{flex:none;width:20px;height:20px;object-fit:contain;border-radius:50%}.ob-token-totals li{align-items:center}.ob-token-totals strong,.ob-board strong,.ob-stat dd{font-variant-numeric:tabular-nums}.ob-footer{color:#9eb5c7;border-top:1px solid #295065;margin-top:16px;padding:12px 2px 0;font-size:12px;line-height:1.55;display:grid;gap:6px}.ob-footer a{color:#b7dae7;text-decoration:underline;text-underline-offset:2px}.ob-footer code{font-family:var(--font-geist-mono),monospace;overflow-wrap:anywhere}.ob-footer details summary{cursor:pointer;width:fit-content}.ob-footer details p{margin-top:4px}@media(max-width:760px){.ob-hero h1{font-size:clamp(34px,10vw,54px)}.ob-footer{font-size:11px}}"}</style>
      <div className="ob-shell">
        <header className="ob-head">
          <a href="https://www.digdug.do/" className="ob-brand">DIGDUG.DO <span>/ USDDD SCAN</span></a>
          <nav className="ob-nav" aria-label="Observatory">
            <a href="https://www.digdug.do/">Home</a>
            <a href={dispatch}>Surface Dispatch</a>
            <Link href="/fund">Fund Network</Link>
            <span className="ob-testnet" title="Testnet rewards are simulated. Eligible Mainnet rewards will be real and withdrawable after launch.">Live - Testnet</span>
            <a className="ob-play" href={play}>Play Flatverse</a>
          </nav>
        </header>
        <section className="ob-hero"><h1>Flatverse <span>Observatory</span></h1><p>Practice World · Simulated rewards</p></section>
        {snapshot?.worldActive === false && <p className="ob-state">World idle · Simulated explorers resume when someone plays.{snapshot.lastWorldTick != null && <> Last game activity {timestamp.format(snapshot.lastWorldTick)} UTC.</>}</p>}
        {!snapshot && <p className="ob-state" role="status">Practice activity is temporarily unavailable.</p>}
        <dl className="ob-stats" aria-label="Practice World activity">
          {metrics.map(({label, icon, value}) => <div className="ob-stat" key={label}><i aria-hidden="true">{icon}</i><div><dt>{label}</dt><dd>{value ?? <span aria-label="Unavailable">—</span>}</dd></div></div>)}
        </dl>
        <div className="ob-grid">
          <section className="ob-panel">
            <h2>World map <small>· Flatverse mine cross-section</small></h2>
            <div className="ob-map" aria-label="Illustrated cross-section of the Flatverse mine"><div className="ob-regions">{["Americas", "Arabian Peninsula", "Pacific"].map((name, index) => {
                const region = snapshot?.regions?.[index];
                return <span key={name}>{name}{region && <small style={{display:"block",fontSize:12,marginTop:5}}>{region.active} active · {region.golden} golden</small>}</span>;
              })}</div></div>
            <div className="ob-extractions">
              <h2>Latest extractions</h2>
              {recentFinds.length ? (
                <ol className="ob-finds">
                  {recentFinds.slice(0, 10).map((find, index) => (
                    <li key={index}>
                      <time dateTime={new Date(find.at).toISOString()}>{timestamp.format(find.at)} UTC</time>
                      {find.tokens.map((token, tokenIndex) => (
                        <div key={tokenIndex}>
                          {token.amount} {token.symbol}
                          {token.usdCents !== null && <span> · ${(token.usdCents / 100).toFixed(2)} simulated</span>}
                        </div>
                      ))}
                    </li>
                  ))}
                </ol>
              ) : <p>{snapshot?.recentFinds ? "No practice extractions recorded yet." : "Practice extraction activity is temporarily unavailable."}</p>}
            </div>
          </section>
          <div className="ob-side">
            <section className="ob-panel">
              <h2>Extracted in the last 24 hours</h2>
              {captures ? <>
                <p>{captures.finds} finds · ${(captures.valueCents / 100).toFixed(2)} simulated value</p>
                <p>Full-world tracking began {timestamp.format(captures.trackingSince)} UTC.</p>
                {captures.tokens.length > 0 && <ul className="ob-token-totals">{captures.tokens.map(token=>(
                  <li key={token.symbol}>
                    <span className="ob-token-name">
                      {tokenLogos[token.symbol] && <Image src={tokenLogos[token.symbol]} width={20} height={20} alt="" unoptimized />}
                      {token.symbol}
                    </span>
                    <strong>{token.amount}</strong>
                  </li>
                ))}</ul>}
              </> : <p>24-hour totals are temporarily unavailable.</p>}
            </section>
            <section className="ob-panel"><h2>Daily practice ranks</h2><p>Top ten · Resets at 00:00 UTC</p>
              {snapshot?.leaderboard.length ? <ol className="ob-board">{snapshot.leaderboard.slice(0, 10).map((actor, index) => <li key={index}><span>{index + 1}.</span><span>{actor.name}{actor.runs != null && <small> · {actor.runs} runs</small>}</span><strong>${(actor.score / 100).toFixed(2)}</strong></li>)}</ol> : <p>No standings available.</p>}
            </section>
            <div className="ob-lower">
              <section className="ob-panel"><a href={dispatch}>Surface Dispatch ›</a><p>Launches, maintenance, and field updates.</p></section>
              <section className="ob-panel"><Link href="/fund">Back Exploration ›</Link><p>Explore backing options on Fund Network.</p></section>
            </div>
            <a className="ob-play ob-play-large" href={play}>Play Flatverse <span aria-hidden="true">›</span></a>
          </div>
        </div>
        <footer className="ob-footer">
          <p>Testnet rewards are simulated and cannot be withdrawn. After Mainnet launches, eligible Mainnet rewards will be real and withdrawable under the rules in effect at launch.</p>
          <details>
            <summary>Fair play</summary>
            <p>Play fairly, respect other explorers, and report game issues through DIGDUG.DO.</p>
          </details>
          <p>USDDD contract on BNB Smart Chain · <a href={`https://bscscan.com/token/${usdddContract}`}><code>{usdddContract}</code></a></p>
          <p>© {new Date().getUTCFullYear()} DIGDUG.DO</p>
        </footer>
      </div>
    </main>
  );
}
