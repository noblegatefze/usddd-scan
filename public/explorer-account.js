(() => {
  const accountOrigin = "https://usddd.digdug.do";
  const mount = document.querySelector("[data-explorer-account]");
  if (!mount || document.querySelector(".dd-account-dialog")) return;
  const play = location.origin === "https://play.digdug.do";
  let linkedUser;
  let linking = false;
  const style = document.createElement("style");
  style.textContent = `
    [data-explorer-account]{margin-left:auto;display:inline-flex;align-items:center;flex:none}
    .dd-account-nav{display:flex;align-items:center;justify-content:flex-end;gap:clamp(8px,1.2vw,16px);margin-inline-start:auto;min-width:0;max-width:100%}
    .dd-account-nav > .site-nav{justify-content:flex-end;width:auto;min-width:0}
    .dd-account-nav > [data-explorer-account]{margin-inline-start:0}
    #gameFocus .dd-account-nav > #siteMenu{margin-inline-start:0}
    @media(max-width:760px){
      header:has(> .dd-account-nav > nav){
        display:grid;grid-template-columns:minmax(0,1fr) auto;
        align-items:center;column-gap:8px;row-gap:8px
      }
      header > .dd-account-nav:has(> nav){display:contents}
      header > .dd-account-nav:has(> nav) > nav{
        grid-column:1 / -1;grid-row:2;display:flex;flex-wrap:wrap;
        justify-content:flex-start;width:100%;min-width:0;max-width:100%;gap:7px 12px
      }
      header > .dd-account-nav > nav > a{min-width:0;max-width:100%;overflow-wrap:anywhere}
      header > .dd-account-nav > [data-explorer-account]{grid-column:2;grid-row:1;justify-self:end}
    }
    .dd-account-avatar{display:grid;place-items:center;width:42px;height:42px;padding:0;border-radius:50%;border:1px solid #62d8ef;background:#103550;color:#e5fbff;font:750 19px system-ui;cursor:pointer}
    .dd-account-avatar{position:relative}
    .dd-account-avatar-image{width:65%;height:65%;object-fit:cover;border-radius:50%;opacity:.6}
    .dd-account-avatar-image[data-custom]{width:100%;height:100%;opacity:1}
    .dd-account-avatar-badge{position:absolute;right:-4px;top:-4px;display:grid;place-items:center;width:17px;height:17px;border-radius:50%;border:1px solid #0b1e30;background:#f8cd67;color:#101b26;font-size:11px}
    .dd-account-avatar:focus-visible,.dd-account-close:focus-visible{outline:2px solid #ffdb4d;outline-offset:3px}
    .dd-account-dialog{position:fixed;inset:0;margin:auto;width:min(660px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid #4bbbce;border-radius:12px;background:#071c2f;color:#effbff}
    .dd-account-dialog::backdrop{background:#020c19bb}
    .dd-account-dialog{inset:auto 12px auto auto;top:var(--account-top,16px);right:var(--account-right,12px);width:min(390px,calc(100vw - 24px));margin:0}
    .dd-account-dialog .dd-account-frame{height:min(var(--account-height,340px),calc(100dvh - var(--account-top,16px) - 63px))}
    .dd-account-dialog::backdrop{background:#020c1966}
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
  frame.src = accountOrigin + "/fund/access?view=home";
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
  let avatarDetails;
  const avatarColors = {violet:"#482875",teal:"#06565b",amber:"#714610",blue:"#1f457e",rose:"#782d54",green:"#2a5636"};
  function paintAvatar() {
    button.style.backgroundColor = "";
    if (!username) {
      button.innerHTML = icon;
      return;
    }
    if (!avatarDetails || avatarDetails.username !== username) {
      button.textContent = Array.from(username)[0]?.toUpperCase() || "?";
      return;
    }
    const {avatar,badge} = avatarDetails;
    const custom = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar) && avatar.length <= 49152;
    const image = document.createElement("img");
    image.alt = "";
    image.className = "dd-account-avatar-image";
    image.toggleAttribute("data-custom",custom);
    image.src = custom ? avatar : "https://play.digdug.do/favicon.svg";
    button.style.backgroundColor = Object.hasOwn(avatarColors,avatar) ? avatarColors[avatar] : avatarColors.blue;
    const emblem = document.createElement("span");
    emblem.className = "dd-account-avatar-badge";
    emblem.title = badge;
    emblem.setAttribute("aria-hidden","true");
    emblem.textContent = badge === "Legacy Backer Badge" ? "◆" : badge === "Legacy Badge" ? "★" : "✦";
    button.replaceChildren(image,emblem);
  }
  let playStatus = "unknown";
  window.addEventListener("message", async event => {
    if (event.origin !== accountOrigin || event.source !== frame.contentWindow) return;
    if (event.data?.type === "flatverse-account-height") {
      const height = event.data.height;
      if (typeof height === "number" && Number.isFinite(height)) {
        dialog.style.setProperty("--account-height", Math.min(700, Math.max(160, Math.ceil(height))) + "px");
      }
    }
    if (event.data?.type === "flatverse-avatar" &&
        typeof event.data.username === "string" && typeof event.data.avatar === "string" &&
        ["Legacy Backer Badge","Legacy Badge","Explorer"].includes(event.data.badge)) {
      avatarDetails = event.data;
      paintAvatar();
    }
    if (event.data?.type === "flatverse-profile") {
      username = typeof event.data.username === "string" ? event.data.username : null;
      button.setAttribute("aria-label", username ? "Explorer account: " + username : "Explorer account");
      button.title = username || "Sign in or enroll";
      if (!username) avatarDetails = undefined;
      paintAvatar();
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
  function positionHomeWizard() {
    const rect = button.getBoundingClientRect();
    const top = rect.bottom > 0 && rect.bottom < innerHeight / 2 ? rect.bottom + 8 : 16;
    dialog.style.setProperty("--account-top", top + "px");
    dialog.style.setProperty("--account-right", Math.max(12, innerWidth - rect.right) + "px");
  }
  const open = () => {
    positionHomeWizard();
    if (!dialog.open) dialog.showModal();
    send("flatverse-refresh-profile");
  };
  button.addEventListener("click", open);
  close.addEventListener("click", () => dialog.close());
  window.addEventListener("resize", positionHomeWizard);
  window.addEventListener("focus", () => send("flatverse-refresh-profile"));
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("[data-open-explorer-account]")) open();
  });
  // Next.js can replace the header without reloading the shared script.
  const headerObserver = new MutationObserver(() => {
    const target = document.querySelector("[data-explorer-account]");
    if (target && button.parentElement !== target) {
        paintAvatar();
      target.append(button);
    }
    if (!target && dialog.open) dialog.close();
  });
  headerObserver.observe(document.body, { childList: true, subtree: true });
})();
