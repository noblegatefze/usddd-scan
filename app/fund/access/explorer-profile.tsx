import { useEffect, useState, type FormEvent } from "react";

const presetLabels = {"violet":"Violet aurora","teal":"Glacier cave","amber":"Sunset ice arch","blue":"Ice Wall","rose":"Frozen lake at dawn","green":"Emerald iceberg"};
const colors = { violet: "#482875", teal: "#06565b", amber: "#714610", blue: "#1f457e", rose: "#782d54", green: "#2a5636" };
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const dollars = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

type Profile = { displayName: string; avatar: string; usddd: number; bonusCredits?: number; extractions: number; rewardsUsd: number; unpriced: number };
type Position = { status: string; funded_usdt: string | number | null; usddd_allocated?: string | number | null; usddd_accrued_display?: string | number | null };
type Props = {
  username: string; badge: string; positions: Position[]; busy: boolean; signOut: () => void;
  onAvatar: (avatar: string) => void;
};
const button = "rounded-md border border-cyan-700 px-2.5 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-950 disabled:opacity-50";
const card = "rounded-lg border border-slate-700 bg-slate-950/35 p-3";
const field = "min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs";

function Avatar({ choice, badge, small = false }: { choice: string; badge?: string; small?: boolean }) {
  const preset = Object.hasOwn(colors, choice) ? choice as keyof typeof colors : "blue";
  const custom = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(choice);
  const badgeKind = badge === "Legacy Backer Badge" ? "legacy-backer" : badge === "Backer Badge" ? "backer" : badge === "Legacy Badge" ? "legacy" : "explorer";
  return <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full border border-cyan-300/40 ${small ? "size-7" : "size-11"}`} style={{ backgroundColor: colors[preset] }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={custom ? choice : `/passport-avatars/${preset}.jpg`} alt="" className="size-full rounded-full object-cover" />
    {badge && <span title={badge} className="absolute -right-1 -top-1 size-5 drop-shadow-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/passport-badges/${badgeKind}.svg`} alt={badge} />
    </span>}
  </span>;
}

async function requestProfile(changes: { displayName?: string; avatar?: string } = {}): Promise<Profile> {
  const session = await fetch("/api/fund/authenticator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "play_ticket" }), cache: "no-store" });
  if (!session.ok) throw new Error("Profile temporarily unavailable. Try again.");
  const { ticket } = await session.json();
  const response = await fetch("https://play.digdug.do/api/world?profile=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, ...changes }), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Profile temporarily unavailable. Try again.");
  return data;
}

async function prepareAvatar(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a JPG, PNG, or WebP image up to 5 MB.");
  }
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the image.");
    const edge = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - edge) / 2, (image.height - edge) / 2, edge, edge, 0, 0, 128, 128);
    const result = canvas.toDataURL("image/webp", 0.8);
    if (!result.startsWith("data:image/webp;") || result.length > 49152) throw new Error("Could not prepare the image. Try a smaller file.");
    return result;
  } finally { image.close(); }
}

const amount = (value: string | number | null | undefined) => Math.max(0, Number(value) || 0);

type ValuePoint = { time: number; value: number };

function rememberValue(username: string, value: number): ValuePoint[] {
  const point = { time: Date.now(), value: Math.round(value * 100) / 100 };
  try {
    const key = "flatverse:value-history:" + username;
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    const recent = (Array.isArray(saved) ? saved : []).filter((item): item is ValuePoint =>
      item && Number.isFinite(item.time) && Number.isFinite(item.value) &&
      item.time >= point.time - 30 * 86400000 && item.time <= point.time);
    const last = recent.at(-1);
    if (!last || last.value !== point.value || point.time - last.time >= 3600000) recent.push(point);
    const history = recent.slice(-240);
    localStorage.setItem(key, JSON.stringify(history));
    return history;
  } catch {
    return [point];
  }
}

function NetValueChart({ history }: { history: ValuePoint[] }) {
  if (!history.length) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const values = history.map(point => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const x = (point: ValuePoint) => history.length === 1 ? 160 : 7 + 306 * (point.time - first.time) / Math.max(1, last.time - first.time);
  const y = (point: ValuePoint) => high === low ? 36 : 64 - 56 * (point.value - low) / (high - low);
  return <figure className="grid gap-1">
    <svg viewBox="0 0 320 72" className="h-16 w-full" role="img" aria-label={dollars.format(first.value) + " to " + dollars.format(last.value)}>
      <path d="M7 8H313 M7 36H313 M7 64H313" stroke="#294658" strokeWidth="1" />
      {history.length > 1 && <polyline points={history.map(point => `${x(point)},${y(point)}`).join(" ")} fill="none" stroke="#67e8f9" strokeWidth="2.5" strokeLinejoin="round" />}
      <circle cx={x(last)} cy={y(last)} r="3.5" fill="#67e8f9" />
    </svg>
    <figcaption className="text-xs text-slate-300">{history.length === 1 ? "First value recorded" : "Recent observations"} · This browser</figcaption>
  </figure>;
}

export default function ExplorerProfile({ username, badge, positions, busy, signOut, onAvatar }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [choose, setChoose] = useState(false);
  const [selectedColor, setSelectedColor] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [history, setHistory] = useState<ValuePoint[]>([]);

  useEffect(() => {
    let current = true;
    void requestProfile().then(data => {
      if (!current) return;
      setProfile(data);
      setName(data.displayName);
    }).catch(error => { if (current) setMessage(error.message); });
    return () => { current = false; };
  }, [username]);

  useEffect(() => {
    if (profile) onAvatar(profile.avatar);
  }, [profile, onAvatar]);

  async function save(getChanges: () => Promise<{ displayName?: string; avatar?: string }>) {
    if (locked) return;
    setLocked(true);
    setMessage("");
    try {
      const data = await requestProfile(await getChanges());
      setProfile(data);
      setName(data.displayName);
      setSelectedColor("");
      setMessage("Profile updated.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your profile.");
      return false;
    } finally { setLocked(false); }
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(async () => ({ displayName: name })).then(saved => { if (saved) setEditingName(false); });
  }

  const active = positions.filter(position => position.status !== "withdrawn" && amount(position.funded_usdt) > 0);
  const funded = active.reduce((sum, position) => sum + amount(position.funded_usdt), 0);
  const fundValue = active.reduce((sum, position) => {
    const allocated = amount(position.usddd_allocated);
    return sum + (allocated > 0 ? allocated : amount(position.funded_usdt)) + amount(position.usddd_accrued_display);
  }, 0);
  const netValue = profile ? profile.usddd + profile.rewardsUsd + fundValue : null;
  useEffect(() => {
    if (netValue !== null && Number.isFinite(netValue)) setHistory(rememberValue(username, netValue));
  }, [username, netValue]);

  return <>
    <div className="flex items-center gap-3">
      <Avatar choice={profile?.avatar ?? "blue"} badge={badge} />
      <div className="min-w-0 flex-1">
        {editingName ? <form onSubmit={saveName} className="flex flex-wrap items-center gap-1">
          <input aria-label="Game display name" value={name} onChange={event => setName(event.target.value)} className={field} minLength={2} maxLength={20} required autoFocus />
          <button className={button} disabled={locked || !name.trim() || profile?.displayName === name}>Save</button>
          <button type="button" className="text-xs text-slate-300 underline" disabled={locked} onClick={() => setEditingName(false)}>Cancel</button>
        </form> : <div className="flex flex-wrap items-baseline gap-x-2">
          <h1 className="break-words text-base font-semibold">{profile?.displayName ?? username}</h1>
          <button type="button" className="text-xs text-cyan-200 underline" disabled={!profile || locked} onClick={() => { setName(profile?.displayName ?? username); setEditingName(true); }}>Edit<span className="sr-only"> game display name</span></button>
        </div>}
        <p className="break-words text-xs text-slate-300">@{username} · {badge}</p>
      </div>
    </div>
    <button type="button" className={button} aria-expanded={choose} onClick={() => { setSelectedColor(""); setChoose(!choose); }}>Change profile picture</button>
    {choose && <section aria-label="Profile picture choices" className={card + " grid gap-3"}>
      <div className="flex flex-wrap gap-2">
        {Object.keys(colors).map(color => {
          const selected = (selectedColor || profile?.avatar) === color;
          return <button key={color} type="button" className="grid size-10 place-items-center rounded-md border border-slate-600 hover:bg-cyan-950 focus-visible:outline-2 focus-visible:outline-cyan-200 aria-pressed:border-cyan-300 aria-pressed:bg-cyan-950 aria-pressed:ring-1 aria-pressed:ring-cyan-300" aria-label={presetLabels[color as keyof typeof presetLabels]} title={presetLabels[color as keyof typeof presetLabels]} aria-pressed={selected} disabled={locked} onClick={() => { setMessage(""); setSelectedColor(color); }}><Avatar choice={color} small /></button>;
        })}
      </div>
      <button type="button" className={button} disabled={locked || !selectedColor || selectedColor === profile?.avatar} onClick={() => void save(async () => ({ avatar: selectedColor }))}>{locked ? "Saving…" : "Save profile picture"}</button>
      {message && <p role="status" className="text-xs text-cyan-200">{message}</p>}
      <label className="grid gap-1 text-xs text-cyan-200">Upload image<input type="file" accept="image/jpeg,image/png,image/webp" className="max-w-full text-xs" disabled={locked} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void save(async () => ({ avatar: await prepareAvatar(file) }));
      }} /></label>
    </section>}
    <section className={card + " grid gap-2"} aria-label="Estimated net value">
      <h2 className="text-xs font-semibold text-cyan-100">Estimated net value</h2>
      <p className="text-lg font-semibold">{netValue === null ? "—" : dollars.format(netValue)}</p>
      <NetValueChart history={history} />
      {!!profile?.unpriced && <p className="text-xs text-amber-200">Rewards without a current price are excluded.</p>}
    </section>
    <div className="grid gap-2">
      <details className={card}>
        <summary className="cursor-pointer text-xs font-semibold text-cyan-100">Flatverse</summary>
        <dl className="mt-2 grid gap-1 text-xs">
          <div><dt className="text-slate-300">USDDD Balance (includes bonus)</dt><dd>{profile ? number.format(profile.usddd) : "—"}</dd></div>
          <div><dt className="text-slate-300">Extracted rewards value</dt><dd>{profile ? dollars.format(profile.rewardsUsd) : "—"}</dd></div>
          <div><dt className="text-slate-300">Bonus credits</dt><dd>{profile?.bonusCredits === undefined ? "—" : number.format(profile.bonusCredits)}</dd></div>
          <div><dt className="text-slate-300">Extractions</dt><dd>{profile ? number.format(profile.extractions) : "—"}</dd></div>
        </dl>

      </details>
      <details className={card}>
        <summary className="cursor-pointer text-xs font-semibold text-cyan-100">Fund</summary>
        <dl className="mt-2 grid gap-1 text-xs">
          <div><dt className="text-slate-300">Funded positions</dt><dd>{number.format(active.length)}</dd></div>
          <div><dt className="text-slate-300">Funded amount</dt><dd>{number.format(funded)} USDT</dd></div>
          <div><dt className="text-slate-300">Estimated position value</dt><dd>{dollars.format(fundValue)}</dd></div>
        </dl>
      </details>
    </div>
    {!choose && message && <p role="status" className="text-xs text-cyan-200">{message}</p>}
    <button type="button" className="justify-self-start text-xs text-cyan-200 underline underline-offset-4" onClick={signOut} disabled={busy || locked}>Sign out</button>
  </>;
}
