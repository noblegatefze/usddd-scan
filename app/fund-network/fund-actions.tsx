"use client";

import { useRef, useState, type FormEvent } from "react";

export type FundActionPosition = {
  id: string; position_ref: string; status: string;
  issued_deposit_address?: string | null; locked?: boolean | null;
};
type Action = "issue" | "confirm" | "withdrawal";
type Result = {
  id: string; ok: boolean; error?: string; status?: string; mode?: string;
  position?: { ref: string; deposit_address: string; min_usdt: number; max_usdt: number };
};

const accountOrigin = "https://usddd.digdug.do";
const field = "rounded border border-slate-600 bg-slate-950 px-2.5 py-2 text-xs text-slate-100";
const button = "justify-self-start rounded bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50";

function request(action: Action, payload: Record<string, string>) {
  const frame = document.querySelector<HTMLIFrameElement>(".dd-account-frame")?.contentWindow;
  if (!frame) return Promise.reject(new Error("Open the Explorer account menu and sign in first."));
  return new Promise<Result>((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(new Error("Fund request timed out. Check your positions before trying again."));
    }, 90000);
    function receive(event: MessageEvent) {
      if (event.origin !== accountOrigin || event.source !== frame ||
          event.data?.type !== "flatverse-fund-action-result" || event.data.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (event.data.ok) resolve(event.data);
      else reject(new Error(event.data.error || "Fund request failed."));
    }
    window.addEventListener("message", receive);
    frame.postMessage({ type: "flatverse-fund-action", id, action, payload }, accountOrigin);
  });
}

export default function FundActions({ positions }: { positions: FundActionPosition[] }) {
  const [depositRef, setDepositRef] = useState("");
  const [issued, setIssued] = useState<Result["position"]>();
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const issuanceId = useRef("");
  const deposit = positions.find(position => position.position_ref === depositRef);
  const address = issued?.ref === depositRef ? issued.deposit_address : deposit?.issued_deposit_address;
  const awaiting = positions.filter(position => position.status === "awaiting_funds" && position.issued_deposit_address);
  const withdrawable = positions.filter(position => position.status === "swept_locked" && position.locked === false);

  async function submit(event: FormEvent<HTMLFormElement>, action: Action) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(action);
    setMessage("");
    try {
      if (action === "issue") {
        if (!issuanceId.current) issuanceId.current = crypto.randomUUID();
        const result = await request(action, { request_id: issuanceId.current });
        if (!result.position?.ref) throw new Error("The deposit address was not returned.");
        setIssued(result.position);
        setDepositRef(result.position.ref);
        issuanceId.current = "";
        setMessage("Deposit address created.");
      } else if (action === "confirm") {
        await request(action, { ref: depositRef, tx_hash: String(values.get("tx_hash") ?? "").trim() });
        setMessage("Deposit confirmed. Check your position for its processing status.");
        form.reset();
      } else {
        const result = await request(action, {
          position_ref: String(values.get("position_ref") ?? ""),
          to_address: String(values.get("to_address") ?? "").trim(),
          code: String(values.get("code") ?? ""),
        });
        setMessage(result.mode === "already_requested" ? "A withdrawal was already requested for this position." : "Withdrawal requested. Check your position for updates.");
        form.reset();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fund request failed.");
    } finally {
      const code = form.elements.namedItem("code");
      if (code instanceof HTMLInputElement) code.value = "";
      setBusy(null);
    }
  }

  return <div className="grid gap-3 text-xs">
    <section className="grid gap-2 rounded-md border border-slate-700 p-3">
      <h3 className="font-semibold text-cyan-100">Deposit USDT</h3>
      <form onSubmit={event => void submit(event, "issue")} className="grid gap-2">
        <button disabled={Boolean(busy)} className={button}>{busy === "issue" ? "Creating address…" : "Create deposit address"}</button>
      </form>
      {(awaiting.length > 0 || issued) && <label className="grid gap-1">Deposit position
        <select className={field} value={depositRef} disabled={Boolean(busy)} onChange={event => setDepositRef(event.target.value)}>
          <option value="">Select a position</option>
          {issued && !awaiting.some(item => item.position_ref === issued.ref) && <option value={issued.ref}>{issued.ref}</option>}
          {awaiting.map(item => <option key={item.id} value={item.position_ref}>{item.position_ref}</option>)}
        </select>
      </label>}
      {address && <form onSubmit={event => void submit(event, "confirm")} className="grid gap-2">
        <p>Send only USDT on BNB Smart Chain (BEP-20) to this address.</p>
        <code className="break-all rounded bg-slate-950 p-2">{address}</code>
        {issued?.ref === depositRef && <p>Deposit range: {issued.min_usdt}–{issued.max_usdt} USDT.</p>}
        <label className="grid gap-1">Transaction hash<input name="tx_hash" className={field} pattern="0x[0-9a-fA-F]{64}" maxLength={66} required /></label>
        <button disabled={Boolean(busy)} className={button}>{busy === "confirm" ? "Checking transaction…" : "Confirm deposit"}</button>
      </form>}
    </section>
    <section className="grid gap-2 rounded-md border border-slate-700 p-3">
      <h3 className="font-semibold text-cyan-100">Withdraw USDDD</h3>
      {withdrawable.length ? <form onSubmit={event => void submit(event, "withdrawal")} className="grid gap-2">
        <label className="grid gap-1">Unlocked position<select name="position_ref" className={field} required defaultValue="">
          <option value="">Select a position</option>
          {withdrawable.map(item => <option key={item.id} value={item.position_ref}>{item.position_ref}</option>)}
        </select></label>
        <label className="grid gap-1">BNB Smart Chain withdrawal address<input name="to_address" className={field} pattern="0x[0-9a-fA-F]{40}" maxLength={42} required /></label>
        <label className="grid gap-1">Current Authenticator PIN<input name="code" className={field} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
        <button disabled={Boolean(busy)} className={button}>{busy === "withdrawal" ? "Submitting…" : "Request withdrawal"}</button>
      </form> : <p className="text-slate-300">Withdrawals appear here once the position is unlocked.</p>}
    </section>
    {message && <p role="status" className="rounded border border-slate-700 p-2 text-cyan-100">{message}</p>}
  </div>;
}
