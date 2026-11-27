(() => {
  const accountOrigin = "https://usddd.digdug.do";
  const mount = document.querySelector("[data-explorer-account]");
  if (!mount || document.querySelector(".dd-account-dialog")) return;
  const accountNav = mount.parentElement;
  const siteHeader = accountNav?.parentElement;
  if (siteHeader?.tagName === "HEADER" && accountNav?.matches(".dd-account-nav") && accountNav.querySelector(":scope > nav")) {
    siteHeader.classList.add("dd-account-mobile-header");
  }
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
      .dd-account-mobile-header{position:relative}
      .dd-account-mobile-header > .dd-account-nav{display:block;width:100%;margin-inline-start:0}
      .dd-account-mobile-header > .dd-account-nav > :is(nav,.site-nav,.ob-nav){
        display:flex;flex-wrap:wrap;justify-content:flex-start;
        width:100%;min-width:0;max-width:100%;gap:7px 12px
      }
      .dd-account-mobile-header > .dd-account-nav > nav > a{min-width:0;max-width:100%;overflow-wrap:anywhere}
      .dd-account-mobile-header > :is(.site-brand,.ob-brand,a:first-child){max-width:calc(100% - 42px)}
      .dd-account-mobile-header > .dd-account-nav > [data-explorer-account]{
        position:absolute;inset-block-start:8px;inset-inline-end:10px;z-index:1
      }
      .dd-account-mobile-header .dd-account-avatar{width:32px;height:32px;font-size:15px}
      .dd-account-mobile-header .dd-account-avatar > svg{width:18px;height:18px}
      .dd-account-mobile-header .dd-account-avatar-badge{width:13px;height:13px;font-size:9px}
    }

    .dd-navigation-header{display:flex!important;flex-wrap:nowrap!important;align-items:center;justify-content:space-between;gap:8px!important;overflow:visible!important}
    .dd-navigation-title{min-width:0;white-space:nowrap;font-weight:850;line-height:1.2}
    .dd-navigation-title > span{display:inline-block!important;color:#75ddf2!important;font-size:inherit!important}
    .dd-navigation-replaced{display:none!important}
    .dd-navigation-header > .dd-account-nav,.dd-navigation-game > .dd-account-nav{flex:none;gap:8px}
    #gameFocus.dd-navigation-game{display:flex;flex-wrap:nowrap;align-items:center;overflow:visible}
    #gameFocus.dd-navigation-game > :is(#focusTop,#focusBottom){flex:0 0 auto;white-space:nowrap}
    #gameFocus.dd-navigation-game > .dd-account-nav > #siteMenu > .dd-navigation-panel{right:-48px}
    .dd-navigation-panel > .dd-navigation-title{padding:5px 10px;font:850 13px system-ui;color:#eff7ff}
    .dd-account-nav > details.dd-navigation{position:relative;margin:0!important;z-index:20;flex:none}
    :is(.dd-account-nav,#gameFocus > .dd-account-nav) > details.dd-navigation:is(.dd-navigation,#siteMenu) > summary{box-sizing:border-box;display:grid;place-content:center;width:auto;height:42px;padding:0 11px;border:1px solid #ffeb9e;border-radius:8px;background:#ffd34c;color:#181f2a;font:850 12px system-ui;cursor:pointer;list-style:none}
    :is(.dd-account-nav,#gameFocus > .dd-account-nav) > details.dd-navigation:is(.dd-navigation,#siteMenu) > summary:hover,.dd-navigation[open] > summary{background:#ffe17a}
    @media(max-width:380px){:is(.dd-account-nav,#gameFocus > .dd-account-nav) > details.dd-navigation:is(.dd-navigation,#siteMenu) > summary{padding-inline:7px;font-size:10px}.dd-navigation-header > .dd-navigation-title{font-size:14px!important}}
    .dd-navigation summary::-webkit-details-marker{display:none}
    .dd-navigation-wordmark{
      display:inline-block;
      font-family:"Arial Black",system-ui,sans-serif;
      font-size:1.08em;
      font-weight:950;
      letter-spacing:-.065em;
      line-height:1;
      white-space:nowrap;
      padding-inline:.1em;
      transform:skewX(-10deg);
    }
    .dd-navigation-wordmark > span{color:#594008;letter-spacing:-.045em}
    .dd-navigation > .dd-navigation-panel{position:absolute;inset:auto 0 auto auto;top:calc(100% + 7px);display:grid;gap:4px;width:min(246px,calc(100vw - 70px));padding:8px;border:1px solid #6089a3;border-radius:10px;background:#0c213b;box-shadow:0 8px 22px #0006;z-index:21}
    .dd-navigation:not([open]) > .dd-navigation-panel{display:none}
    .dd-navigation[open] > .dd-navigation-panel{animation:dd-open .18s ease-out}
    @keyframes dd-open{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
    .dd-navigation-panel > :is(a,button){display:block;min-width:0;box-sizing:border-box;padding:9px 10px!important;border-radius:6px;color:#eff7ff!important;font:600 14px system-ui!important;text-align:start!important;text-decoration:none!important;white-space:nowrap}
    .dd-navigation-panel > [aria-current="page"]::after{content:"Current";float:right;font-size:10px;margin-top:3px;color:#75ddf2}
    .dd-navigation-panel > :is(a,button):is(:hover,:focus-visible){background:#173854;outline:1px solid #69c7e8}
    .dd-navigation-panel > a.dd-navigation-play{background:#ffd34c;color:#181f2a!important;font-weight:800!important}
    .dd-navigation-panel > a.dd-navigation-play:hover{background:#ffe17a}
    .dd-navigation-status{display:inline-flex;justify-self:center;align-items:center;gap:5px;margin:4px 10px;padding:3px 6px;border:1px solid #236c56;border-radius:5px;background:#092820;color:#61ff9b;box-shadow:0 0 7px #46ff932e;font:850 10px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;animation:dd-testnet-halo 1.8s ease-in-out infinite}
    .dd-navigation-status::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 7px currentColor;animation:dd-testnet-pulse 1.8s ease-in-out infinite}
    @keyframes dd-testnet-pulse{50%{opacity:.55;box-shadow:0 0 2px currentColor}}
    @keyframes dd-testnet-halo{50%{box-shadow:0 0 12px #46ff9360}}
    @media(prefers-reduced-motion:reduce){.dd-navigation-status,.dd-navigation-status::before{animation:none}}
    @media(max-width:760px){.dd-navigation-header > .dd-navigation-title{font-size:clamp(15px,4.5vw,21px)}}
    @media(max-width:380px){
      #gameFocus.dd-navigation-game > :is(#focusTop,#focusBottom){padding-inline:6px;font-size:12px}
    }
    @media(prefers-reduced-motion:reduce){.dd-navigation[open] > .dd-navigation-panel{animation:none}}
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
    .dd-passport-title{display:flex;align-items:center;gap:8px;min-width:0}
    .dd-passport-brand{display:inline-grid;place-items:center;padding:5px 8px;border:1px solid #ffeb9e;border-radius:8px;background:#ffd34c;color:#181f2a;font:850 12px system-ui}
    .dd-passport-icon{flex:none;width:29px;height:17px;color:#65e9ff;filter:drop-shadow(0 0 3px #11adff)}
    .dd-account-close{background:none;border:0;color:#effbff;cursor:pointer;font:24px system-ui}
    .dd-account-frame{display:block;width:100%;height:min(680px,calc(100dvh - 83px));border:0;background:#071c2f}
  `;
  style.textContent += `
    .dd-about-dialog{box-sizing:border-box;width:min(540px,calc(100vw - 24px));max-height:calc(100dvh - 32px);padding:16px;border:1px solid #6089a3;border-radius:12px;background:#0c213b;color:#eff7ff;font:14px/1.5 system-ui}
    .dd-about-dialog::backdrop{background:#020c19bb}
    .dd-about-dialog > header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .dd-about-dialog h2{margin:0;font:750 19px system-ui}
    .dd-about-content{display:grid;gap:10px;font:14px/1.5 system-ui;text-align:start}
    .dd-about-content img{display:block;width:100%;max-height:145px;object-fit:cover;border-radius:8px}
    .dd-about-content section{display:grid;gap:8px;padding:12px;border:1px solid #315670;border-radius:8px;background:#102943}
    .dd-about-content h3,.dd-about-content h4,.dd-about-content p{margin:0}
    .dd-about-content h3{color:#75ddf2;font-size:15px}
    .dd-about-content h4{font-size:14px}
    .dd-about-content table{width:100%;border-collapse:collapse;color:inherit;font:inherit}
    .dd-about-content :is(th,td){padding:4px 0;border-bottom:1px solid #315670;text-align:start}
    .dd-about-content :is(th,td):last-child{text-align:end}
  `;
  document.head.append(style);

  const aboutContent = document.createElement("template");
  aboutContent.innerHTML = "<div class=\"dd-about-content\">\n  <p>Flatverse is a shared exploration game. Dig beyond the Ice Wall and bring Blue Orbs back to the surface.</p>\n  <img src=\"https://www.digdug.do/flatverse-ice-wall.jpg\" alt=\"The frozen frontier beyond the Ice Wall\" loading=\"lazy\">\n  <section><h3>Lore</h3><div><h4>The last transmission</h4><p>An intelligence from beyond the Ice Wall seized the old Terminal. It studied the Zero Phase dig records and sent explorers a map to what lay beneath the ice. Then ToastPunk, the original founder, vanished.</p></div>\n<div><h4>The prisons below</h4><p>Far beneath each region, a narrow shaft leads to a prison. Step onto a portal to travel to one of the other prisons at random. Go deep enough and you might glimpse ToastPunk behind bars before he disappears again.</p></div></section>\n  <section><h3>Benefits</h3><p>Your Flatverse Passport keeps your explorer name, balance, rewards, and extraction stats together. Guest progress carries over when you set it up in the same browser.</p></section>\n  <section><h3>Testnet bonus credits</h3>\n    <table aria-label=\"Testnet bonus credits\"><thead><tr><th scope=\"col\">Badge</th><th scope=\"col\">Bonus USDDD</th></tr></thead><tbody>\n      <tr><th scope=\"row\">Explorer Badge</th><td>10</td></tr>\n      <tr><th scope=\"row\">Legacy Badge</th><td>25</td></tr>\n      <tr><th scope=\"row\">Backer Badge</th><td>35</td></tr>\n      <tr><th scope=\"row\">Legacy Backer Badge</th><td>50</td></tr>\n    </tbody></table>\n    <p>Your bonus credits are included in your USDDD balance. Testnet rewards are simulated.</p>\n  </section>\n</div>";
  const gameAbout = document.querySelector("template#guide-about");
  if (gameAbout) gameAbout.content.replaceChildren(aboutContent.content.cloneNode(true));

  function createWordmark() {
    const wordmark = document.createElement("span");
    wordmark.className = "dd-navigation-wordmark";
    wordmark.textContent = "FLAT";
    const verse = document.createElement("span");
    verse.textContent = "VERSE";
    wordmark.append(verse);
    return wordmark;
  }

  const destinations = [
    ["Home", "HOME", "https://www.digdug.do/"],
    ["Play Flatverse", "PLAY", "https://play.digdug.do/"],
    ["Fund Network", "FUND", "https://fund.digdug.do/"],
    ["Observatory", "USDDD", "https://usddd.digdug.do/"],
    ["Surface Dispatch", "FEED", "https://feed.digdug.do/"]
  ];
  const host = location.hostname.replace(/^www\./, "");
  const current = destinations.find(([, , url]) => new URL(url).hostname.replace(/^www\./, "") === host);
  const gameMenu = accountNav?.querySelector(":scope > #siteMenu");
  const oldNav = accountNav?.querySelector(":scope > nav");
  const brand = gameMenu ? siteHeader?.querySelector(".dd-navigation-title") : siteHeader?.firstElementChild;
  if (current && accountNav?.matches(".dd-account-nav") && (gameMenu || (siteHeader?.tagName === "HEADER" && oldNav && brand))) {
    const [,, currentUrl] = current;
    const menu = gameMenu || document.createElement("details");
    menu.classList.add("dd-navigation");
    const toggle = menu.querySelector("summary") || document.createElement("summary");
    toggle.setAttribute("aria-label", "FLATVERSE site navigation");
    toggle.replaceChildren(createWordmark());
    if (!toggle.parentNode) menu.append(toggle);
    const links = menu.querySelector("nav") || document.createElement("nav");
    links.setAttribute("aria-label", "DIGDUG.DO sites");
    links.classList.add("dd-navigation-panel");
    if (!links.parentNode) menu.append(links);
    links.querySelectorAll(":scope > a").forEach(link => link.remove());
    const title = brand || document.createElement("strong");
    title.classList.add("dd-navigation-title");
    const suffix = document.createElement("span");
    const show = (value) => {
      if (suffix.textContent === value) return;
      suffix.textContent = value;
      suffix.getAnimations().forEach(animation => animation.cancel());
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        suffix.animate([{opacity:.45,transform:"translateY(3px)"},{opacity:1,transform:"translateY(0)"}],{duration:150});
      }
    };
    title.replaceChildren("DIGDUG.DO / ", suffix);
    show(current[1]);
    siteHeader.classList.remove("dd-account-mobile-header");
    siteHeader.classList.add(gameMenu ? "dd-navigation-game" : "dd-navigation-header");
    const destinationLinks = destinations.map(([label, value, url]) => {
      const link = document.createElement("a");
      link.textContent = label;
      link.href = url;
      if (url === currentUrl) link.setAttribute("aria-current", "page");
      else if (gameMenu) { link.target = "_blank"; link.rel = "noopener"; }
      if (value === "PLAY") link.classList.add("dd-navigation-play");
      link.addEventListener("pointerenter", () => show(value));
      link.addEventListener("pointerleave", () => {
        show(links.contains(document.activeElement) ? document.activeElement.dataset.preview || current[1] : current[1]);
      });
      link.dataset.preview = value;
      link.addEventListener("focus", () => show(value));
      link.addEventListener("blur", () => show(current[1]));
      link.addEventListener("click", event => {
        show(value);
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (url === currentUrl) {
          event.preventDefault();
          menu.open = false;
          toggle.focus();
        } else if (gameMenu) {
          setTimeout(() => { menu.open = false; }, 160);
        } else if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          event.preventDefault();
          setTimeout(() => location.assign(url), 150);
        }
      });
      return link;
    });
    if (gameMenu) destinationLinks.unshift(title);
    links.prepend(...destinationLinks);
    if (!gameMenu) {
      const about = document.createElement("dialog");
      about.className = "dd-about-dialog";
      about.setAttribute("aria-labelledby", "dd-about-title");
      const heading = document.createElement("header");
      const title = document.createElement("h2");
      title.id = "dd-about-title";
      title.textContent = "What is Flatverse?";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "dd-account-close";
      close.setAttribute("aria-label", "Close What is Flatverse?");
      close.textContent = "×";
      close.addEventListener("click", () => about.close());
      heading.append(title, close);
      about.append(heading, aboutContent.content.cloneNode(true));
      document.body.append(about);
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.textContent = title.textContent;
      trigger.setAttribute("aria-haspopup", "dialog");
      trigger.addEventListener("click", () => {
        menu.open = false;
        toggle.focus();
        about.showModal();
        about.scrollTop = 0;
      });
      links.append(trigger);
    }
    const status = document.createElement("span");
    status.className = "dd-navigation-status";
    status.textContent = "LIVE - TESTNET";
    status.title = "Testnet game rewards are simulated.";
    links.append(status);
    if (oldNav) oldNav.classList.add("dd-navigation-replaced");
    if (!gameMenu) accountNav.insertBefore(menu, mount);
    menu.addEventListener("toggle", () => { if (!menu.open) show(current[1]); });
    document.addEventListener("pointerdown", event => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && menu.open) {
        menu.open = false;
        if (menu.contains(document.activeElement)) toggle.focus();
      }
    });
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dd-account-avatar";
  button.setAttribute("aria-label", "Flatverse Passport");
  button.setAttribute("aria-haspopup", "dialog");
  const icon = '<svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.2"/><path d="M5 20v-1.6a7 7 0 0 1 14 0V20"/></svg>';
  button.innerHTML = icon;
  const dialog = document.createElement("dialog");
  dialog.className = "dd-account-dialog";
  dialog.setAttribute("aria-label", "Flatverse Passport");
  const heading = document.createElement("div");
  heading.className = "dd-account-heading";
  const passportTitle = document.createElement("span");
  passportTitle.className = "dd-passport-title";
  const passportBrand = document.createElement("span");
  passportBrand.className = "dd-passport-brand";
  passportBrand.append(createWordmark());
  passportTitle.append(passportBrand, "Passport");
  const firmament = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  firmament.classList.add("dd-passport-icon");
  firmament.setAttribute("viewBox", "0 0 34 20");
  firmament.setAttribute("aria-hidden", "true");
  const dome = document.createElementNS(firmament.namespaceURI, "path");
  dome.setAttribute("d", "M1 17h32M3 17a14 14 0 0 1 28 0M9 17c0-7 3.5-12 8-14 4.5 2 8 7 8 14M4 12q13-8 26 0");
  dome.setAttribute("fill", "none");
  dome.setAttribute("stroke", "currentColor");
  dome.setAttribute("stroke-width", "1.45");
  dome.setAttribute("stroke-linecap", "round");
  firmament.append(dome);
  passportTitle.append(firmament);
  heading.append(passportTitle);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "dd-account-close";
  close.setAttribute("aria-label", "Close Flatverse Passport");
  close.textContent = "×";
  heading.append(close);
  const frame = document.createElement("iframe");
  frame.className = "dd-account-frame";
  frame.title = "Flatverse Passport setup";
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
    emblem.textContent = badge.endsWith("Backer Badge") ? "◆" : badge === "Legacy Badge" ? "★" : "✦";
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
        ["Legacy Backer Badge","Legacy Badge","Backer Badge","Explorer Badge","Explorer"].includes(event.data.badge)) {
      avatarDetails = event.data;
      paintAvatar();
    }
    if (event.data?.type === "flatverse-profile") {
      username = typeof event.data.username === "string" ? event.data.username : null;
      button.setAttribute("aria-label", username ? "Flatverse Passport: " + username : "Flatverse Passport");
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
