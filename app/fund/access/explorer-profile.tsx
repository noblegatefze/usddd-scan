import { useEffect, useState, type FormEvent } from "react";

const favicon = "https://play.digdug.do/favicon.svg";
const colors = { violet: "#482875", teal: "#06565b", amber: "#714610", blue: "#1f457e", rose: "#782d54", green: "#2a5636" };
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const dollars = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

type Profile = { displayName: string; avatar: string; usddd: number; startingCredit: number | null; extractions: number; sponsorPoints: number; rewardsUsd: number; unpriced: number };
type Position = { status: string; funded_usdt: string | number | null; usddd_allocated?: string | number | null; usddd_accrued_display?: string | number | null };
type Props = {
  username: string; badge: string; positions: Position[]; busy: boolean; signOut: () => void;
  onAvatar: (avatar: string) => void;
};
const button = "rounded-md border border-cyan-700 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-950 disabled:opacity-50";
const card = "rounded-lg border border-slate-700 bg-slate-950/35 p-3";
const field = "min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2";

function Avatar({ choice, badge, small = false }: { choice: string; badge?: string; small?: boolean }) {
  const background = colors[choice as keyof typeof colors];
  const custom = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(choice);
  const icon = badge === "Legacy Backer Badge" ? "◆" : badge === "Legacy Badge" ? "★" : "✦";
  return <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full border border-cyan-300/40 ${small ? "size-9" : "size-16"}`} style={{ backgroundColor: background ?? colors.blue }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={custom ? choice : favicon} alt="" className={custom ? "size-full rounded-full object-cover" : "size-2/3 rounded-full opacity-60"} />
    {badge && <span aria-label={badge} title={badge} className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full border border-slate-900 bg-amber-300 text-sm text-slate-950">{icon}</span>}
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

export default function ExplorerProfile({ username, badge, positions, busy, signOut, onAvatar }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [choose, setChoose] = useState(false);

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
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your profile.");
    } finally { setLocked(false); }
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(async () => ({ displayName: name }));
  }

  const active = positions.filter(position => position.status !== "withdrawn" && amount(position.funded_usdt) > 0);
  const funded = active.reduce((sum, position) => sum + amount(position.funded_usdt), 0);
  const fundValue = active.reduce((sum, position) => {
    const allocated = amount(position.usddd_allocated);
    return sum + (allocated > 0 ? allocated : amount(position.funded_usdt)) + amount(position.usddd_accrued_display);
  }, 0);
  return <>
    <div className="flex items-center gap-4">
      <Avatar choice={profile?.avatar ?? "blue"} badge={badge} />
      <div className="min-w-0">
        <h1 className="break-words text-xl font-semibold">{profile?.displayName ?? username}</h1>
        <p className="break-words text-sm text-slate-300">@{username} · {badge}</p>
      </div>
    </div>
    <button type="button" className={button} aria-expanded={choose} onClick={() => setChoose(!choose)}>Change profile picture</button>
    {choose && <section aria-label="Profile picture choices" className={card + " grid gap-3"}>
      <div className="flex flex-wrap gap-2">
        {Object.keys(colors).map(color => <button key={color} type="button" className="rounded-full ring-offset-2 ring-offset-slate-900 aria-pressed:ring-2 aria-pressed:ring-cyan-200" aria-label={color + " Flatverse logo"} aria-pressed={profile?.avatar === color} disabled={locked} onClick={() => void save(async () => ({ avatar: color }))}><Avatar choice={color} small /></button>)}
      </div>
      <label className="grid gap-1 text-sm text-cyan-200">Upload image<input type="file" accept="image/jpeg,image/png,image/webp" className="max-w-full text-sm" disabled={locked} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void save(async () => ({ avatar: await prepareAvatar(file) }));
      }} /></label>
    </section>}
    <form onSubmit={saveName} className="grid gap-1.5">
      <label htmlFor="game-display-name" className="text-sm font-medium">Game display name</label>
      <div className="flex gap-2">
        <input id="game-display-name" value={name} onChange={event => setName(event.target.value)} className={field} placeholder={username} minLength={2} maxLength={20} required />
        <button className={button} disabled={locked || !name.trim() || profile?.displayName === name}>Save</button>
      </div>
    </form>
    <section className={card + " grid gap-2"} aria-label="Estimated net value">
      <h2 className="text-sm font-semibold text-cyan-100">Estimated net value</h2>
      <p className="text-2xl font-semibold">{profile ? dollars.format(profile.usddd + profile.rewardsUsd + fundValue) : "—"}</p>
      <p className="text-xs text-slate-300">Practice USDDD and rewards are simulated. The total includes the estimated Fund position value.</p>
      {!!profile?.unpriced && <p className="text-xs text-amber-200">Rewards without a current price are excluded.</p>}
    </section>
    <div className="grid grid-cols-2 gap-2">
      <section className={card} aria-label="Practice World stats">
        <h2 className="mb-2 text-sm font-semibold text-cyan-100">Practice World</h2>
        <dl className="grid gap-1 text-sm">
          <div><dt className="text-slate-300">USDDD</dt><dd>{profile ? number.format(profile.usddd) : "—"}</dd></div>
          <div><dt className="text-slate-300">Rewards value</dt><dd>{profile ? dollars.format(profile.rewardsUsd) : "—"}</dd></div>
          <div><dt className="text-slate-300">Extractions</dt><dd>{profile ? number.format(profile.extractions) : "—"}</dd></div>
          <div><dt className="text-slate-300">Sponsor points</dt><dd>{profile ? number.format(profile.sponsorPoints) : "—"}</dd></div>
        </dl>
        {!!profile?.startingCredit && <p className="mt-2 text-xs text-cyan-200">{profile.startingCredit} USDDD starting credit available on your first signed-in play.</p>}
      </section>
      <section className={card} aria-label="Fund stats">
        <h2 className="mb-2 text-sm font-semibold text-cyan-100">Fund</h2>
        <dl className="grid gap-1 text-sm">
          <div><dt className="text-slate-300">Funded positions</dt><dd>{number.format(active.length)}</dd></div>
          <div><dt className="text-slate-300">Funded amount</dt><dd>{number.format(funded)} USDT</dd></div>
          <div><dt className="text-slate-300">Estimated position value</dt><dd>{dollars.format(fundValue)}</dd></div>
        </dl>
      </section>
    </div>
    {message && <p role="status" className="text-sm text-cyan-200">{message}</p>}
    <button type="button" className="justify-self-start text-sm text-cyan-200 underline underline-offset-4" onClick={signOut} disabled={busy || locked}>Sign out</button>
  </>;
}
