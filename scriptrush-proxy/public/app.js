(() => {
  const root = document.getElementById("app");
  const state = {
    tab: "generate",
    game: localStorage.getItem("sr_game") || "",
    place: localStorage.getItem("sr_place") || "",
    prompt: "",
    error: "",
    current: localStorage.getItem("scriptrush_current_script") || "",
    profile: localStorage.getItem("scriptrush_runtime_profile") || "",
    files: [],
    output: "",
    title: "script.lua",
    notice: "",
    busy: false,
    stage: "",
    step: 0,
    elapsed: 0,
    copied: false,
    controller: null,
    timer: null,
  };

  const steps = ["Understanding", "Researching", "Planning", "Writing", "Checking", "Finalizing"];
  const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
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
      const autoStep = Math.min(4, Math.floor(state.elapsed / 18));
      if (autoStep > state.step) {
        state.step = autoStep;
        state.stage = steps[autoStep];
      }
      updateProgress();
    }, 1000);
  }

  function setStage(label, step) {
    state.stage = label;
    state.step = step;
    updateProgress();
  }

  function updateProgress() {
    const stage = document.getElementById("stage");
    const elapsed = document.getElementById("elapsed");
    const fill = document.getElementById("progress-fill");
    if (stage) stage.textContent = state.stage;
    if (elapsed) elapsed.textContent = state.elapsed + "s";
    if (fill) fill.style.width = Math.min(96, 10 + state.step * 17 + state.elapsed / 15) + "%";
  }

  async function copyText(value) {
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
    setStage("Researching game", 1);
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

  function requestSources() {
    const sources = state.files.map((file) => ({
      name: file.name,
      content: file.content.slice(0, 70000),
      size: file.size,
    }));
    if (state.profile) {
      sources.unshift({
        name: "scriptrush-runtime-profile.json",
        content: state.profile.slice(0, 76000),
        size: Math.min(state.profile.length, 76000),
      });
    }
    return sources.slice(0, 6);
  }

  async function generate(fix) {
    if (state.busy) return;
    const request = (fix ? state.error : state.prompt).trim();
    state.notice = "";

    if (!state.game.trim()) state.notice = "Add the game name or link.";
    else if (!request) state.notice = fix ? "Paste the error or requested change." : "Describe the script.";
    else if (fix && !state.current.trim()) state.notice = "Paste or generate a script first.";

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
      setStage("Planning features", 2);
      await new Promise((resolve) => setTimeout(resolve, 250));
      setStage(fix ? "Patching current script" : "Writing script", 3);

      const body = {
        game: state.game.trim(),
        placeId: state.place.trim(),
        mode: fix ? "fix" : "build",
        prompt: request,
        sources: requestSources(),
      };
      if (fix) body.currentScript = state.current;

      const response = await fetch("/api/guest-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: state.controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed.");

      setStage("Checking script", 4);
      const code = extractCode(data.message);
      if (!code) throw new Error("No complete script returned.");

      setStage("Finalizing", 5);
      state.current = code;
      state.output = code;
      state.title = fix ? "fixed-script.lua" : "script.lua";
      localStorage.setItem("scriptrush_current_script", code);
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

  async function getScanner() {
    if (state.busy) return;
    state.notice = "";
    state.busy = true;
    state.stage = "Preparing live scanner";
    startProgress();
    render();
    try {
      const response = await fetch("/api/scanner", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.script) throw new Error(data.error || "Scanner unavailable.");
      state.output = data.script;
      state.title = "live-scanner.lua";
    } catch (error) {
      state.notice = error?.message || "Scanner unavailable.";
    } finally {
      state.busy = false;
      stopTimer();
      render();
    }
  }

  function importReport() {
    const area = document.getElementById("report");
    let raw = String(area?.value || "").trim();
    const marker = "[SCRIPTRUSH_RUNTIME_PROFILE]";
    if (raw.includes(marker)) raw = raw.slice(raw.lastIndexOf(marker) + marker.length).trim();
    try {
      const profile = JSON.parse(raw);
      if (!profile.game || (!profile.game.placeId && !profile.game.universeId)) throw new Error("invalid");
      state.profile = JSON.stringify(profile);
      localStorage.setItem("scriptrush_runtime_profile", state.profile);
      if (profile.game.placeId) state.place = String(profile.game.placeId);
      state.notice = "Game learned.";
      saveGame();
    } catch {
      state.notice = "Invalid scanner report.";
    }
    render();
  }

  async function addFiles(input) {
    const files = [];
    for (const file of Array.from(input.files || []).slice(0, 5)) {
      if (!/\.(lua|luau|txt|log|json|md)$/i.test(file.name)) continue;
      if (file.size > 750000) continue;
      files.push({ name: file.name, content: (await file.text()).slice(0, 70000), size: file.size });
    }
    state.files = files;
    render();
  }

  function progressHtml() {
    if (!state.busy) return "";
    return `<section class="progress-card">
      <div class="progress-head"><span class="spinner"></span><b id="stage">${esc(state.stage)}</b><em id="elapsed">${state.elapsed}s</em></div>
      <div class="progress-track"><i id="progress-fill" style="width:${10 + state.step * 17}%"></i></div>
      <div class="progress-steps">${steps.map((step, index) => `<span class="${index <= state.step ? "done" : ""}">${esc(step)}</span>`).join("")}</div>
      <button class="text-button" data-action="stop">Stop</button>
    </section>`;
  }

  function outputHtml() {
    if (!state.output) return "";
    return `<section class="output-card">
      <header><span>${esc(state.title)}</span><div><button data-action="copy">${state.copied ? "Copied" : "Copy"}</button><button data-action="expand">Expand</button></div></header>
      <pre><code>${esc(state.output)}</code></pre>
    </section>`;
  }

  function panelHtml() {
    if (state.tab === "generate") {
      return `<section class="panel">
        <textarea id="prompt" placeholder="What should the script do?">${esc(state.prompt)}</textarea>
        <footer><label class="file-button">Add files<input id="files" type="file" multiple accept=".lua,.luau,.txt,.log,.json,.md"></label><span>${state.files.length ? state.files.length + " added" : state.profile ? "Game profile ready" : "Files optional"}</span><button class="primary" data-action="generate">Generate</button></footer>
      </section>`;
    }

    if (state.tab === "learn") {
      return `<section class="panel learn-panel">
        <button class="primary wide" data-action="scanner">Get live scanner</button>
        <div class="mini-steps"><span>Copy</span><span>Run in game</span><span>Paste report</span></div>
        <textarea id="report" placeholder="Paste [SCRIPTRUSH_RUNTIME_PROFILE] report">${esc(state.profile)}</textarea>
        <button class="secondary wide" data-action="import">Import report</button>
        ${state.profile ? '<div class="profile-ready">● Game profile ready</div>' : ""}
      </section>`;
    }

    return `<section class="panel fix-panel">
      <textarea id="error" placeholder="Paste the error or describe the change">${esc(state.error)}</textarea>
      <div class="current-row"><span>${state.current ? "Current script loaded" : "No current script"}</span>${state.current ? '<button data-action="clear">Clear</button>' : ""}</div>
      <textarea id="current" class="script-input" placeholder="Paste the script to fix">${esc(state.current)}</textarea>
      <button class="primary wide" data-action="fix">Fix current script</button>
    </section>`;
  }

  function render() {
    root.innerHTML = `<header class="topbar"><div class="brand"><i>S</i><b>ScriptRush</b></div><span>Test</span></header>
      <main class="workspace">
        <section class="game-row"><input id="game" value="${esc(state.game)}" placeholder="Game name or Roblox link"><input id="place" value="${esc(state.place)}" placeholder="Place ID"></section>
        <nav>${[["generate","Generate"],["learn","Learn game"],["fix","Fix script"]].map(([key,label]) => `<button data-tab="${key}" class="${state.tab === key ? "active" : ""}">${label}</button>`).join("")}</nav>
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

    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.onclick = () => {
        state.tab = button.dataset.tab;
        state.notice = "";
        render();
      };
    });

    root.querySelectorAll("[data-action]").forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.action;
        if (action === "generate") generate(false);
        if (action === "fix") generate(true);
        if (action === "scanner") getScanner();
        if (action === "import") importReport();
        if (action === "copy") copyText(state.output);
        if (action === "expand") document.getElementById("modal")?.classList.remove("hidden");
        if (action === "close") document.getElementById("modal")?.classList.add("hidden");
        if (action === "clear") {
          state.current = "";
          localStorage.removeItem("scriptrush_current_script");
          render();
        }
        if (action === "stop") state.controller?.abort();
      };
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.getElementById("modal")?.classList.add("hidden");
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !state.busy) {
      if (state.tab === "generate") generate(false);
      if (state.tab === "fix") generate(true);
    }
  });

  render();
})();
