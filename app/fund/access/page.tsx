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
  const [pending, setPending] = useState<{ challenge: string; setupKey: string } | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPositions() {
    const data = await post("positions", { authenticator: true });
    setPositions(data.positions);
  }

  useEffect(() => { void loadPositions().catch(() => {}); }, []);

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
        : { action: mode, username: fields.get("username"), pass: fields.get("pass"), code: fields.get("code") });
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-out failed.");
    } finally { setBusy(false); }
  }

  const field = "block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2";
  return <main className="mx-auto max-w-2xl px-5 py-10">
    <a href="/fund" className="text-sky-300">← Fund Network</a>
    <h1 className="mt-4 text-3xl font-semibold">Fund Network access</h1>
    {positions ? <>
      <h2 className="mt-6 text-xl">Your positions</h2>
      {positions.length === 0 && <p className="mt-3">No positions are linked to this account.</p>}
      <ul className="my-4 space-y-3">{positions.map(position => <li key={position.id} className="rounded-md border border-slate-700 p-4">
        <strong>{position.position_ref}</strong>
        <p>{position.status}{position.funded_usdt != null && <> · {position.funded_usdt} USDT</>}</p>
        {position.deposit_tx_hash && <p className="break-all">Deposit receipt {position.deposit_tx_hash}</p>}
        {position.sweep_tx_hash && <p className="break-all">Sweep receipt {position.sweep_tx_hash}</p>}
      </li>)}</ul>
      <button type="button" disabled={busy} onClick={signOut} className="underline">Sign out</button>
    </> : <>
      <h2 className="mt-6 text-xl">{mode === "login" ? "Sign in" : mode === "start" ? "Set up Google Authenticator" : "Confirm your setup"}</h2>
      {pending && mode === "finish" && <p className="mt-3">In Google Authenticator, add a time-based entry named DIGDUG.DO Fund Network with this setup key. <code className="block break-all py-2">{pending.setupKey}</code></p>}
      <form key={mode} onSubmit={submit} className="my-4 grid gap-3">
        {mode !== "finish" && <>
          <label>Terminal username<input className={field} name="username" autoComplete="username" maxLength={100} required /></label>
          <label>Terminal Pass<input className={field} name="pass" type="password" autoComplete="current-password" maxLength={256} required /></label>
        </>}
        {mode !== "start" && <label>Six-digit Authenticator code<input className={field} name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>}
        <button disabled={busy} className="rounded-md bg-sky-300 px-4 py-2 font-semibold text-slate-950">{busy ? "Checking…" : mode === "login" ? "Sign in" : mode === "start" ? "Get setup key" : "Verify and sign in"}</button>
        <p role="status" className="text-amber-300">{message}</p>
      </form>
      <button type="button" disabled={busy} className="underline" onClick={() => {
        setPending(null);
        setMessage("");
        setMode(mode === "login" ? "start" : "login");
      }}>{mode === "login" ? "Set up Google Authenticator" : "Back to sign-in"}</button>
      <p className="mt-4 text-sm">Lost access to your Authenticator? Contact Fund support for manual review.</p>
    </>}
    {positions && <p role="status" className="mt-3 text-amber-300">{message}</p>}
  </main>;
}
