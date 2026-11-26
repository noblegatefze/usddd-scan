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
  const [mode, setMode] = useState<"login" | "start" | "finish">("login");
  const [pending, setPending] = useState<{ challenge: string; setupKey: string; qrCode: string } | null>(null);
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
        : mode === "start"
          ? { action: mode, username: fields.get("username"), pass: fields.get("pass") }
          : { action: mode, username: fields.get("username"), code: fields.get("code") });
      form.reset();
      if (mode === "start") {
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
  return <main className="mx-auto max-w-3xl px-5 py-10 text-slate-100">
    <a href="/fund" className="text-sky-300">← Fund Network</a>
    <header className="mt-5 rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <h1 className="text-3xl font-semibold">Fund Network access</h1>
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
      <h2 className="mt-6 text-xl">{mode === "login" ? "Sign in" : mode === "start" ? "Set up Google Authenticator" : "Confirm your setup"}</h2>
      {mode === "start" && <p className="mt-2 text-sm text-slate-300">{explorerEnrollment ? "Choose a username. It’s also your display name. New Explorers can leave Terminal Pass blank. If you were invited to the Fund Authenticator pilot, use your Terminal Pass once to prove ownership of your existing username." : "Use your Terminal Pass once to link Google Authenticator to your username. Keep access to that Authenticator entry."}</p>}
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
        {mode === "start" && <label>Terminal Pass <span className="text-xs text-slate-400">{explorerEnrollment ? "(optional)" : "(one-time setup)"}</span><input className={field} name="pass" type="password" autoComplete="current-password" maxLength={256} required={!explorerEnrollment} /></label>}
        {mode !== "start" && <label>Six-digit Authenticator code<input className={field} name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>}
        <button disabled={busy} className="rounded-md bg-sky-300 px-4 py-2 font-semibold text-slate-950">{busy ? "Checking…" : mode === "login" ? "Sign in" : mode === "start" ? "Continue to Authenticator" : "Verify and sign in"}</button>
        <p role="status" className="text-amber-300">{message}</p>
      </form>
      <button type="button" disabled={busy} className="underline" onClick={() => {
        setPending(null);
        setMessage("");
        setMode(mode === "login" ? "start" : "login");
      }}>{mode === "login" ? "Set up account" : "Back to sign-in"}</button>
      <p className="mt-4 text-sm">Lost access to your Authenticator? Contact Fund support for manual review.</p>
    </>}
    {positions && <p role="status" className="mt-3 text-amber-300">{message}</p>}
  </main>;
}
