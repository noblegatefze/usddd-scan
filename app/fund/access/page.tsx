"use client";

import { useEffect, useState, type FormEvent } from "react";

type Position = {
  id: string;
  position_ref: string;
  status: string;
  funded_usdt: string | number | null;
  deposit_tx_hash: string | null;
  sweep_tx_hash: string | null;
};

async function post(path: string, body: object) {
  const response = await fetch("/api/fund/" + path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    cache: "no-store", body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Fund access is temporarily unavailable.");
  return data;
}

export default function FundAccess() {
  const [mode, setMode] = useState<"login" | "new" | "legacy" | "finish">("login");
  const [pending, setPending] = useState<{ challenge: string; setupKey: string; qrCode: string } | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const [explorerEnrollment, setExplorerEnrollment] = useState(false);
  const [explorer, setExplorer] = useState<{ username: string; badge: string } | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPositions() {
    const data = await post("positions", { authenticator: true });
    setPositions(data.positions);
    setExplorer(data.explorer ?? null);
  }

  useEffect(() => {
    setEmbedded(window.parent !== window);
    const controller = new AbortController();
    void loadPositions().catch(() => {});
    void fetch("/api/fund/authenticator", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (response.ok) setExplorerEnrollment((await response.json()).explorerEnrollment === true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const data = await post("authenticator", mode === "finish"
        ? { action: mode, challenge: pending?.challenge, code: fields.get("code") }
        : mode === "new" || mode === "legacy"
          ? { action: "start", username: fields.get("username"), pass: mode === "legacy" ? fields.get("pass") : "" }
          : { action: mode, username: fields.get("username"), code: fields.get("code") });
      form.reset();
      if (mode === "new" || mode === "legacy") {
        setPending(data);
        setMode("finish");
      } else {
        setPending(null);
        setMode("login");
        await loadPositions();
      }
    } catch (error) {
      for (const name of ["pass", "code"]) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.value = "";
      }
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      await post("authenticator", { action: "signout" });
      setPositions(null);
      setExplorer(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-out failed.");
    } finally { setBusy(false); }
  }

  const field = "block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2";
  return <main className="mx-auto max-w-3xl bg-[#071c2f] px-5 py-5 text-slate-100">
    {!embedded && <a href="/fund" className="text-sky-300">← Fund Network</a>}
    <header className="mt-5 rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <h1 className="text-2xl font-semibold">Explorer accounts</h1>
      <p className="mt-2 text-sm text-slate-300">{explorerEnrollment ? "Create an Explorer account or sign in with Google Authenticator. This view is read-only. Use Fund Network for deposit and withdrawal requests." : "Read-only Authenticator pilot for invited accounts. Use Fund Network for deposit and withdrawal requests."}</p>
    </header>
    {positions ? <>
      {explorer && <p className="mt-6 text-sky-300">{explorer.username} · {explorer.badge}</p>}
      <h2 className="mt-6 text-xl">Your positions</h2>
      {positions.length === 0 && <p className="mt-3">No positions are linked to this account.</p>}
      <ul className="my-4 space-y-3">{positions.map(position => <li key={position.id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <strong>{position.position_ref}</strong>
        <p className="mt-1 text-slate-300"><span className="capitalize">{position.status === "swept_locked" ? "Swept and locked" : position.status.replaceAll("_", " ")}</span>{position.funded_usdt != null && <> · {position.funded_usdt} USDT</>}</p>
        {position.deposit_tx_hash && <p className="mt-2 break-all text-sm"><span className="block text-slate-400">Deposit receipt</span><code>{position.deposit_tx_hash}</code></p>}
        {position.sweep_tx_hash && <p className="mt-2 break-all text-sm"><span className="block text-slate-400">Sweep receipt</span><code>{position.sweep_tx_hash}</code></p>}
      </li>)}</ul>
      <button type="button" disabled={busy} onClick={signOut} className="underline">Sign out</button>
    </> : <>
      {mode !== "finish" && <div role="group" aria-label="Account options" className="mt-4 flex flex-wrap gap-2">
        {([["legacy", "Migrate a Legacy account"], ["new", "Create a new Explorer account"], ["login", "Already enrolled? Sign in"]] as const).map(([option, label]) => <button key={option} type="button" disabled={busy} aria-pressed={mode === option} className="rounded-md border border-sky-500 px-3 py-2 text-sm aria-pressed:bg-sky-950" onClick={() => { setMode(option); setMessage(""); }}>{label}</button>)}
      </div>}
      <h2 className="mt-6 text-xl">{mode === "login" ? "Sign in" : mode === "finish" ? "Confirm your setup" : mode === "legacy" ? "Migrate your Legacy account" : "Create an Explorer account"}</h2>
      {mode === "legacy" && <p className="mt-2 text-sm text-slate-300">Verify your existing username and Terminal Pass once. The Legacy Badge starts with 25 USDDD and the Legacy Backer Badge starts with 50 USDDD in the Practice World.</p>}
      {mode === "new" && <p className="mt-2 text-sm text-slate-300">Choose a username and set up Google Authenticator. New Explorers start with 10 USDDD in the Practice World.</p>}
      {mode === "new" && !explorerEnrollment && <p role="status" className="mt-2 text-amber-300">Public Explorer enrollment is pending.</p>}
      {mode === "login" && <p className="mt-2 text-sm text-slate-300">Enter your username and the current six-digit code from Google Authenticator.</p>}
      {pending && mode === "finish" && <div className="mt-3 space-y-3">
        <p>Scan this QR code in Google Authenticator, then enter the six-digit code below.</p>
        <p className="text-amber-300">Keep the Authenticator entry for your username. You’ll use its current six-digit code to sign in on any device.</p>
        {/* The data URL contains the enrollment secret, so render it locally. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pending.qrCode} alt="Scan to enroll in Fund Network" width={240} height={240} className="max-w-full rounded-md" />
        <details><summary>Enter a setup key manually</summary><code className="block break-all py-2">{pending.setupKey}</code></details>
      </div>}
      <form key={mode} onSubmit={submit} className="my-4 grid gap-3">
        {mode !== "finish" && <>
          <label>Username<input className={field} name="username" autoComplete="username" maxLength={100} required /></label>
        </>}
        {mode === "legacy" && <label>Terminal Pass<input className={field} name="pass" type="password" autoComplete="current-password" maxLength={256} required /></label>}
        {(mode === "login" || mode === "finish") && <label>Six-digit Authenticator code<input className={field} name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>}
        {(mode === "new" || mode === "legacy") && explorerEnrollment && <aside className="rounded-lg border border-amber-400/50 bg-amber-950/30 p-3 text-sm text-amber-100" aria-label="Flatverse Fair Play">
          <strong>Flatverse Fair Play</strong>
          <p className="mt-1">Player-operated bots, scripts, macros, and other gameplay automation are prohibited. Confirmed use results in an immediate Flatverse ban and forfeiture of all in-game rewards earned on the account.</p>
          <p className="mt-2"><a className="underline" href="https://play.digdug.do/#game-rules" target="_blank" rel="noreferrer">Read Game Rules (opens in a new tab)</a> · <a className="underline" href="mailto:usddd@digdug.do">Report a game issue</a></p>
        </aside>}
        <button disabled={busy || (mode === "new" && !explorerEnrollment)} className="rounded-md bg-sky-300 px-4 py-2 font-semibold text-slate-950">{busy ? "Checking…" : mode === "login" ? "Sign in" : mode === "finish" ? "Verify and sign in" : "Continue to Authenticator"}</button>
        <p role="status" className="text-amber-300">{message}</p>
      </form>
      {mode === "finish" && <button type="button" disabled={busy} className="underline" onClick={() => { setPending(null); setMessage(""); setMode("login"); }}>Back to sign-in</button>}
      <p className="mt-4 text-sm">Lost access to your Authenticator? Email <a className="underline" href="mailto:usddd@digdug.do">usddd@digdug.do</a> for manual review.</p>
    </>}
    {positions && <p role="status" className="mt-3 text-amber-300">{message}</p>}
  </main>;
}
