export const dynamic = "force-dynamic";

function client() {
  const app = document.getElementById("app");
  const state = {
    tab: "generate",
    game: localStorage.getItem("sr_game") || "",
    place: localStorage.getItem("sr_place") || "",
    prompt: "",
    error: "",
    current: localStorage.getItem("scriptrush_current_script") || "",
    profile: localStorage.getItem("scriptrush_studio_profile") || "",
    files: [],
    output: "",
    title: "script.lua",
    busy: false,
    stage: "",
    step: 0,
    elapsed: 0,
    controller: null,
    notice: "",
    copied: false,
    timer: null,
  };

  const steps = [
    "Understanding request",
    "Researching game",
    "Planning features",
    "Writing script",
    "Checking result",
    "Finalizing",
  ];

  const esc = (value) => String(value || "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);

  const extractCode = (value) => {
    const match = String(value || "").match(/```(?:lua|luau)?\s*([\s\S]*?)```/i);
    return match?.[1]?.trim() || "";
  };

  function saveGame() {
    localStorage.setItem("sr_game", state.game);
    localStorage.setItem("sr_place", state.place);
  }

  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function startProgress() {
    stopTimer();
    state.elapsed = 0;
    state.step = 0;
    state.stage = steps[0];
    state.timer = setInterval(() => {
      state.elapsed += 1;
      if (state.elapsed % 18 === 0 && state.step < 4) {
        state.step += 1;
        state.stage = steps[state.step];
      }
      updateProgress();
    }, 1000);
  }

  function updateProgress() {
    const label = document.getElementById("stage");
    const elapsed = document.getElementById("elapsed");
    const fill = document.getElementById("fill");
    if (label) label.textContent = state.stage;
    if (elapsed) elapsed.textContent = state.elapsed + "s";
    if (fill) fill.style.width = Math.min(92, 12 + state.step * 17 + state.elapsed / 10) + "%";
  }

  function setStage(label, step) {
    state.stage = label;
    state.step = step;
    updateProgress();
  }

  async function copy(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    state.copied = true;
    render();
    setTimeout(() => {
      state.copied = false;
      render();
    }, 1300);
  }

  async function researchGame() {
    if (!state.game.trim()) return null;
    setStage(steps[1], 1);
    try {
      const response = await fetch("/api/research-game?q=" + encodeURIComponent(state.game.trim()), { cache: "no-store" });
      if (!response.ok) return null;
      const data = await response.json();
      const profile = data.profile || data.research || data.result || data;
      if (profile?.placeId) state.place = String(profile.placeId);
      if (profile?.name && !/roblox\.com\/games\//i.test(state.game)) state.game = String(profile.name);
      saveGame();
      return profile;
    } catch {
      return null;
    }
  }

  function sources() {
    const list = state.files.map((file) => ({
      name: file.name,
      content: file.content.slice(0, 70000),
      size: file.size,
    }));
    if (state.profile) {
      list.unshift({
        name: "scriptrush-studio-profile.json",
        content: state.profile.slice(0, 76000),
        size: state.profile.length,
      });
    }
    return list.slice(0, 6);
  }

  async function run(fix) {
    if (state.busy) return;
    state.notice = "";
    const request = (fix ? state.error : state.prompt).trim();

    if (!state.game.trim()) state.notice = "Add the game name or link.";
    else if (!request) state.notice = fix ? "Paste the error." : "Describe the script.";
    else if (fix && !state.current) state.notice = "Paste or generate a script first.";

    if (state.notice) {
      render();
      return;
    }

    state.busy = true;
    state.controller = new AbortController();
    startProgress();
    render();

    try {
      await researchGame();
      setStage(steps[2], 2);
      await new Promise((resolve) => setTimeout(resolve, 300));
      setStage(fix ? "Patching current script" : steps[3], 3);

      const body = {
        game: state.game.trim(),
        placeId: state.place.trim(),
        mode: fix ? "fix" : "build",
        prompt: request,
        sources: sources(),
      };
      if (fix) body.currentScript = state.current;

      const response = await fetch("/api/guest-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: state.controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed.");

      setStage(steps[4], 4);
      const output = extractCode(data.message);
      if (!output) throw new Error("No complete script returned.");

      setStage(steps[5], 5);
      state.current = output;
      state.output = output;
      state.title = fix ? "fixed-script.lua" : "script.lua";
      localStorage.setItem("scriptrush_current_script", output);
      if (fix) state.error = "";
      else state.prompt = "";
    } catch (error) {
      state.notice = error?.name === "AbortError" ? "Stopped." : error?.message || "Generation failed.";
    } finally {
      state.busy = false;
      state.controller = null;
      stopTimer();
      render();
    }
  }

  async function getProfileScript() {
    if (state.busy) return;
    state.busy = true;
    state.stage = "Preparing Studio profile";
    startProgress();
    render();
    try {
      const response = await fetch("/api/studio-profile", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.script) throw new Error(data.error || "Profile script failed.");
      state.output = data.script;
      state.title = "studio-profile.lua";
    } catch (error) {
      state.notice = error.message || "Profile script failed.";
    } finally {
      state.busy = false;
      stopTimer();
      render();
    }
  }

  function importProfile() {
    const area = document.getElementById("profile");
    let raw = (area?.value || "").trim();
    const marker = "[SCRIPTRUSH_STUDIO_PROFILE]";
    if (raw.includes(marker)) raw = raw.slice(raw.indexOf(marker) + marker.length).trim();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.game) throw new Error("Invalid profile");
      state.profile = JSON.stringify(parsed);
      localStorage.setItem("scriptrush_studio_profile", state.profile);
      state.notice = "Game profile imported.";
    } catch {
      state.notice = "Invalid profile.";
    }
    render();
  }

  async function addFiles(input) {
    const list = [];
    for (const file of Array.from(input.files || []).slice(0, 5)) {
      if (!/\.(lua|luau|txt|log|json|md)$/i.test(file.name)) continue;
      list.push({
        name: file.name,
        content: (await file.text()).slice(0, 70000),
        size: file.size,
      });
    }
    state.files = list;
    render();
  }

  function progressHtml() {
    if (!state.busy) return "";
    return `<section class="progress">
      <div><span class="spin"></span><b id="stage">${esc(state.stage)}</b><em id="elapsed">${state.elapsed}s</em></div>
      <i><u id="fill" style="width:${12 + state.step * 17}%"></u></i>
      <small>${steps.map((step, index) => `<span class="${index <= state.step ? "on" : ""}">${esc(step)}</span>`).join("")}</small>
      <button data-action="stop">Stop</button>
    </section>`;
  }

  function outputHtml() {
    if (!state.output) return "";
    return `<section class="output">
      <header><span>${esc(state.title)}</span><div><button data-action="copy">${state.copied ? "Copied" : "Copy"}</button><button data-action="expand">Expand</button></div></header>
      <pre><code>${esc(state.output)}</code></pre>
    </section>`;
  }

  function panelHtml() {
    if (state.tab === "generate") {
      return `<section class="panel">
        <textarea id="prompt" placeholder="What should the script do?">${esc(state.prompt)}</textarea>
        <footer><label>Files<input id="files" type="file" multiple accept=".lua,.luau,.txt,.log,.json,.md"></label><span>${state.files.length ? state.files.length + " added" : "Optional"}</span><button class="primary" data-action="generate">Generate</button></footer>
      </section>`;
    }
    if (state.tab === "learn") {
      return `<section class="panel learn">
        <button class="primary wide" data-action="profile-script">Get Studio profile script</button>
        <div class="three"><span>Copy</span><span>Run in Studio</span><span>Paste result</span></div>
        <textarea id="profile" placeholder="Paste [SCRIPTRUSH_STUDIO_PROFILE] report">${esc(state.profile)}</textarea>
        <button class="secondary wide" data-action="import">Import profile</button>
        ${state.profile ? '<div class="ready">● Game learned</div>' : ""}
      </section>`;
    }
    return `<section class="panel">
      <textarea id="error" placeholder="Paste the error or describe the fix">${esc(state.error)}</textarea>
      <div class="current"><span>${state.current ? "Current script loaded" : "No current script"}</span>${state.current ? '<button data-action="clear">Clear</button>' : ""}</div>
      <textarea id="current" class="script" placeholder="Paste the script to fix">${esc(state.current)}</textarea>
      <button class="primary wide" data-action="fix">Fix current script</button>
    </section>`;
  }

  function render() {
    app.innerHTML = `<header class="top"><div><i>S</i><b>ScriptRush</b></div><span>Test mode</span></header>
      <main>
        <div class="game"><input id="game" value="${esc(state.game)}" placeholder="Game name or Roblox link"><input id="place" value="${esc(state.place)}" placeholder="Place ID"></div>
        <nav>${["generate", "learn", "fix"].map((tab) => `<button class="${state.tab === tab ? "active" : ""}" data-tab="${tab}">${tab === "learn" ? "Learn game" : tab === "fix" ? "Fix script" : "Generate"}</button>`).join("")}</nav>
        ${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}
        ${panelHtml()}
        ${progressHtml()}
        ${outputHtml()}
      </main>
      <div id="modal" class="modal hidden"><header><span>${esc(state.title)}</span><div><button data-action="copy">${state.copied ? "Copied" : "Copy"}</button><button data-action="close">Close</button></div></header><pre><code>${esc(state.output)}</code></pre></div>`;

    const game = document.getElementById("game");
    const place = document.getElementById("place");
    const prompt = document.getElementById("prompt");
    const error = document.getElementById("error");
    const current = document.getElementById("current");
    const files = document.getElementById("files");

    if (game) game.oninput = (event) => { state.game = event.target.value; saveGame(); };
    if (place) place.oninput = (event) => { state.place = event.target.value.replace(/\D/g, ""); event.target.value = state.place; saveGame(); };
    if (prompt) prompt.oninput = (event) => { state.prompt = event.target.value; };
    if (error) error.oninput = (event) => { state.error = event.target.value; };
    if (current) current.oninput = (event) => { state.current = event.target.value; localStorage.setItem("scriptrush_current_script", state.current); };
    if (files) files.onchange = () => addFiles(files);

    app.querySelectorAll("[data-tab]").forEach((button) => {
      button.onclick = () => {
        state.tab = button.dataset.tab;
        state.notice = "";
        render();
      };
    });

    app.querySelectorAll("[data-action]").forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.action;
        if (action === "generate") run(false);
        if (action === "fix") run(true);
        if (action === "profile-script") getProfileScript();
        if (action === "import") importProfile();
        if (action === "copy") copy(state.output);
        if (action === "expand") document.getElementById("modal").classList.remove("hidden");
        if (action === "close") document.getElementById("modal").classList.add("hidden");
        if (action === "clear") {
          state.current = "";
          localStorage.removeItem("scriptrush_current_script");
          render();
        }
        if (action === "stop") {
          state.controller?.abort();
          state.busy = false;
          stopTimer();
          state.notice = "Stopped.";
          render();
        }
      };
    });
  }

  document.onkeydown = (event) => {
    if (event.key === "Escape") document.getElementById("modal")?.classList.add("hidden");
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !state.busy) {
      if (state.tab === "generate") run(false);
      if (state.tab === "fix") run(true);
    }
  };

  render();
}

const CSS = `:root{color-scheme:dark;--bg:#07111f;--line:#294b70;--text:#f4f8ff;--blue:#4f8cff;--cyan:#2bd3c2}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}button,input,textarea{font:inherit}.top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 22px;background:#07111fe8;position:sticky;top:0;z-index:20}.top>div{display:flex;align-items:center;gap:9px}.top i{width:32px;height:32px;border-radius:9px;background:var(--blue);display:grid;place-items:center;font-style:normal;font-weight:900}.top b{font-size:13px}.top>span{font-size:9px;border:1px solid var(--line);border-radius:999px;padding:6px 9px;color:#9bb2cd}main{width:min(1000px,calc(100% - 24px));margin:auto;padding:28px 0 70px}.game{display:grid;grid-template-columns:1fr 170px;gap:8px}.game input,.panel textarea{border:1px solid #365f89;background:#091827;color:white;border-radius:11px;outline:none}.game input{height:43px;padding:0 12px;font-size:12px}nav{display:flex;gap:6px;margin:13px 0}nav button{border:1px solid var(--line);background:#0a1a2d;color:#7691af;border-radius:9px;padding:8px 13px;font-size:10px}nav .active{background:var(--blue);color:white;border-color:#78a8ed}.panel{border:1px solid var(--line);background:linear-gradient(150deg,#0f2037,#091525);border-radius:15px;padding:12px}.panel textarea{width:100%;min-height:126px;resize:vertical;padding:13px;font-size:12px;line-height:1.55}.panel footer{display:flex;align-items:center;gap:9px;margin-top:9px}.panel label,.secondary{border:1px solid var(--line);border-radius:8px;background:#0b1d33;color:#9ab2ce;padding:8px 10px;font-size:9px}.panel label input{display:none}.panel footer>span{font-size:9px;color:#617f9f}.primary,.secondary,.output button,.modal button,.current button{border-radius:8px;padding:8px 11px;font-size:10px;font-weight:750}.primary{border:1px solid #78a9ef;background:linear-gradient(145deg,#5f9cf9,#3d79df);color:white;margin-left:auto}.secondary{color:#d7e7fb}.wide{width:100%;margin-top:9px}.learn{max-width:720px;margin:auto}.three{display:flex;justify-content:center;gap:18px;color:#607c9b;font-size:8px;margin:11px}.ready{margin-top:9px;border:1px solid #276064;border-radius:9px;background:#0a272d;color:#75e2d4;padding:9px;font-size:9px}.current{display:flex;justify-content:space-between;align-items:center;color:#7893b2;font-size:9px;margin:8px 0}.current button{border:1px solid #593c49;background:#28151e;color:#ff9aac}.script{min-height:250px!important;font-family:Consolas,monospace!important}.notice{border:1px solid #3c6085;border-radius:9px;background:#0c1d32;padding:9px 11px;font-size:10px;margin-bottom:8px}.progress{margin-top:12px;border:1px solid #315777;border-radius:13px;background:#0a1b2e;padding:11px}.progress>div{display:flex;align-items:center;gap:8px}.progress em{margin-left:auto;font-style:normal;color:#6f8dab;font-size:9px}.spin{width:13px;height:13px;border:2px solid #315a80;border-top-color:var(--cyan);border-radius:50%;animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}.progress>i{display:block;height:4px;background:#112a44;border-radius:999px;overflow:hidden;margin:10px 0}.progress>i u{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--cyan));text-decoration:none;transition:.4s}.progress small{display:flex;gap:5px;overflow:auto}.progress small span{white-space:nowrap;border:1px solid #1f3d5b;border-radius:999px;padding:4px 7px;color:#506d8a;font-size:8px}.progress small .on{color:#a9c9eb;border-color:#3c678f}.progress>button{margin-top:9px;border:1px solid #70404a;background:#29151d;color:#ff9da8;border-radius:8px;padding:6px 9px;font-size:9px}.output{margin-top:13px;border:1px solid #2c5076;border-radius:13px;background:#040a12;overflow:hidden}.output header,.modal header{height:43px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;background:#0b192a;border-bottom:1px solid #1e3b58}.output header>div,.modal header>div{display:flex;gap:6px}.output button,.modal button{border:1px solid #3d6d9d;background:#102744;color:#dceafd}.output pre{margin:0;min-height:430px;max-height:72vh;overflow:auto;padding:15px;white-space:pre}.output code,.modal code{font:11px/1.62 Consolas,monospace;color:#dceafa}.modal{position:fixed;inset:10px;z-index:100;background:#040a12;border:1px solid #37628d;border-radius:13px;display:grid;grid-template-rows:43px 1fr}.hidden{display:none}.modal pre{margin:0;padding:17px;overflow:auto;white-space:pre}@media(max-width:700px){.top{padding:0 11px}main{width:calc(100% - 16px);padding-top:16px}.game{grid-template-columns:1fr}.game input:last-child{display:none}nav{display:grid;grid-template-columns:repeat(3,1fr)}nav button{padding:9px 4px}.panel footer{flex-wrap:wrap}.primary{width:100%;margin-left:0}.output pre{min-height:55vh}.progress small{display:none}.modal{inset:3px}}`;

export async function GET() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ScriptRush</title><style>${CSS}</style></head><body><div id="app"></div><script>(${client.toString()})();</script></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
