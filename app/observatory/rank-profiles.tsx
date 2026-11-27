"use client";

import { useRef, useState } from "react";

export type Rank = {
  name: string; bot: boolean; score: number; runs?: number;
  avatar?: string; badge?: string | null; netValue?: number | null; firstDigAt?: number | null;
};

const presets = ["violet", "teal", "amber", "blue", "rose", "green"];
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const avatar = (choice?: string) =>
  choice?.startsWith("data:image/webp;base64,") ? choice :
    `/passport-avatars/${presets.includes(choice ?? "") ? choice : "blue"}.jpg`;

export default function RankProfiles({ ranks }: { ranks: Rank[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Rank | null>(null);
  return <>
    <ol className="ob-board">{ranks.map((actor, index) => <li key={index}>
      <span>{index + 1}.</span>
      <span className="flex min-w-0 items-center gap-2">
        <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-cyan-950 focus-visible:outline-2 focus-visible:outline-yellow-300" aria-label={`View explorer profile for ${actor.name}`} aria-haspopup="dialog" onClick={() => {
          setSelected(actor);
          dialog.current?.showModal();
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar(actor.avatar)} alt="" className="size-8 rounded-full border border-cyan-600 object-cover" />
        </button>
        <span className="min-w-0 break-words">{actor.name}{actor.runs != null && <small> · {actor.runs} runs</small>}</span>
      </span>
      <strong>{dollars.format(actor.score / 100)}</strong>
    </li>)}</ol>
    <dialog ref={dialog} aria-labelledby="ob-profile-title" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-cyan-500 bg-[#061c2d] p-4 text-white shadow-2xl backdrop:bg-slate-950/80">
      {selected && <>
        <header className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar(selected.avatar)} alt="" className="size-12 rounded-full border border-cyan-600 object-cover" />
          <h2 id="ob-profile-title" className="min-w-0 flex-1 break-words text-lg font-bold">{selected.name}</h2>
          <button type="button" autoFocus className="size-10 shrink-0 rounded-md border border-cyan-700 text-xl" aria-label="Close explorer profile" onClick={() => dialog.current?.close()}>×</button>
        </header>
        <dl className="mt-4 grid gap-3 rounded-lg border border-slate-700 p-3">
          <div><dt className="text-xs text-cyan-200">Badge type</dt><dd>{selected.badge ?? (selected.bot ? "Simulated explorer" : "Unavailable")}</dd></div>
          <div><dt className="text-xs text-cyan-200">Estimated Practice World net value</dt><dd>{selected.netValue == null ? "Unavailable" : dollars.format(selected.netValue)}</dd></div>
          <div><dt className="text-xs text-cyan-200">First recorded dig</dt><dd>{selected.firstDigAt ? <time dateTime={new Date(selected.firstDigAt).toISOString()}>{date.format(selected.firstDigAt)}</time> : "No date on record"}</dd></div>
        </dl>
      </>}
    </dialog>
  </>;
}
