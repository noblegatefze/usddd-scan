(() => {
  const accountOrigin = "https://usddd.digdug.do";
  const mount = document.querySelector("[data-explorer-account]");
  if (!mount || mount.childElementCount) return;
  const play = location.origin === "https://play.digdug.do";
  let linkedUser;
  let linking = false;
  const style = document.createElement("style");
  style.textContent = `
    [data-explorer-account]{margin-left:auto;display:inline-flex;align-items:center;flex:none}
    .dd-account-avatar{display:grid;place-items:center;width:42px;height:42px;padding:0;border-radius:50%;border:1px solid #62d8ef;background:#103550;color:#e5fbff;font:750 19px system-ui;cursor:pointer}
    .dd-account-avatar:focus-visible,.dd-account-close:focus-visible{outline:2px solid #ffdb4d;outline-offset:3px}
    .dd-account-dialog{position:fixed;inset:0;margin:auto;width:min(660px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid #4bbbce;border-radius:12px;background:#071c2f;color:#effbff}
    .dd-account-dialog::backdrop{background:#020c19bb}
    .dd-account-heading{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #265374;font:700 16px system-ui}
    .dd-account-close{background:none;border:0;color:#effbff;cursor:pointer;font:24px system-ui}
    .dd-account-frame{display:block;width:100%;height:min(680px,calc(100dvh - 83px));border:0;background:#071c2f}
  `;
  document.head.append(style);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dd-account-avatar";
  button.setAttribute("aria-label", "Explorer account");
  button.setAttribute("aria-haspopup", "dialog");
  const icon = '<svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.2"/><path d="M5 20v-1.6a7 7 0 0 1 14 0V20"/></svg>';
  button.innerHTML = icon;
  const dialog = document.createElement("dialog");
  dialog.className = "dd-account-dialog";
  dialog.setAttribute("aria-label", "Explorer account");
  const heading = document.createElement("div");
  heading.className = "dd-account-heading";
  heading.textContent = "Explorer account";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "dd-account-close";
  close.setAttribute("aria-label", "Close Explorer account");
  close.textContent = "×";
  heading.append(close);
  const frame = document.createElement("iframe");
  frame.className = "dd-account-frame";
  frame.title = "Explorer account forms";
  frame.referrerPolicy = "strict-origin";
  frame.src = accountOrigin + "/fund/access";
  dialog.append(heading, frame);
  mount.append(button);
  document.body.append(dialog);
  const send = type => frame.contentWindow?.postMessage({type}, accountOrigin);
  const gameSession = async body => {
    const response = await fetch("/api/world?account=1", {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
    });
    if (!response.ok) throw new Error("Play sign-in unavailable");
  };
  let username;
  let playStatus = "unknown";
  window.addEventListener("message", async event => {
    if (event.origin !== accountOrigin || event.source !== frame.contentWindow) return;
    if (event.data?.type === "flatverse-profile") {
      username = typeof event.data.username === "string" ? event.data.username : null;
      button.setAttribute("aria-label", username ? "Explorer account: " + username : "Explorer account");
      button.title = username || "Sign in or enroll";
      if (username) button.textContent = Array.from(username)[0]?.toUpperCase() || "?";
      else button.innerHTML = icon;
      if (!play || linking) return;
      if (username && linkedUser !== username) {
        linking = true;
        send("flatverse-request-play-ticket");
      } else if (!username && playStatus !== "guest") {
        try { await gameSession({signout:true}); linkedUser = null; playStatus = "guest"; } catch {}
      }
    }
    if (play && event.data?.type === "flatverse-play-ticket" && typeof event.data.ticket === "string") {
      const requestedUser = username;
      try {
        await gameSession({ticket:event.data.ticket});
        if (requestedUser && requestedUser === username) {
          linkedUser = requestedUser;
          playStatus = "registered";
        } else {
          await gameSession({signout:true});
          linkedUser = null;
          playStatus = "guest";
        }
      } catch { button.title = "Explorer signed in. Practice World connection unavailable."; }
      finally { linking = false; }
    }
    if (event.data?.type === "flatverse-play-unavailable") linking = false;
  });
  const open = () => {
    if (!dialog.open) dialog.showModal();
    send("flatverse-refresh-profile");
  };
  button.addEventListener("click", open);
  close.addEventListener("click", () => dialog.close());
  window.addEventListener("focus", () => send("flatverse-refresh-profile"));
  document.querySelectorAll("[data-open-explorer-account]").forEach(trigger => trigger.addEventListener("click", open));
})();
