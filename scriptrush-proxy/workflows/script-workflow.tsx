"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameSelector } from "../components/game-selector";
import { ScriptEditor } from "../components/script-editor";
import { GenerationProgress } from "../components/generation-progress";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { researchGame, generateScript } from "../lib/api";
import { createProfileSource } from "../lib/validation";
import { getSelection, setSelection, getCurrentScript, setCurrentScript, getRuntimeProfile, setRuntimeProfile, addHistory, readHistory } from "../lib/storage";
import type { GameSelection, Source, RuntimeProfile, HistoryEntry } from "../lib/types";

const presets = [
  ["Auto Farm", "Create an Auto Farm using only confirmed game systems, with respawn recovery and cleanup."],
  ["Auto Boss", "Create an Auto Boss script using only bosses confirmed by research or the runtime profile."],
  ["Quest Farm", "Create a quest farming script using only quests confirmed for this game."],
  ["Full Hub", "Create one complete Luau script with a compact black-and-white UI for confirmed game features."],
] as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Your input was preserved.";
}

type IdentifiedGame = GameSelection & { universeId?: string };

function profileMatches(profile: RuntimeProfile, selection: IdentifiedGame): boolean {
  if (profile.game.placeId) return String(profile.game.placeId) === selection.placeId;
  return Boolean(selection.universeId && String(profile.game.universeId ?? "") === selection.universeId);
}

export function ScriptWorkflow({ mode }: { mode: "build" | "fix" }) {
  const fixing = mode === "fix";
  const [game, setGame] = useState("");
  const [identified, setIdentified] = useState<IdentifiedGame>();
  const [prompt, setPrompt] = useState("");
  const [original, setOriginal] = useState("");
  const [previous, setPrevious] = useState("");
  const [result, setResult] = useState("");
  const [profile, setProfile] = useState<RuntimeProfile | null>(null);
  const [files, setFiles] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [researching, setResearching] = useState(false);
  const [stage, setStage] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<HistoryEntry>();
  const [compare, setCompare] = useState(false);
  const [ready, setReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const submitted = useRef(false);
  const fileReading = useRef(false);
  const comparison = useMemo(() => {
    const before = previous.split(/\r\n|\r|\n/);
    const after = result.split(/\r\n|\r|\n/);
    let changed = Math.abs(before.length - after.length);
    for (let index = 0; index < Math.min(before.length, after.length); index++) if (before[index] !== after[index]) changed++;
    return { beforeLines: before.length, afterLines: after.length, changed };
  }, [previous, result]);
  const draftKey = fixing ? "scriptrush_fix_draft_v2" : "scriptrush_create_draft_v2";

  useEffect(() => {
    const selection = getSelection();
    setGame(selection.game);
    if (selection.placeId) setIdentified(selection);
    let current = getCurrentScript();
    if (fixing) try { current = localStorage.getItem("scriptrush_fix_script_draft_v2") ?? current; } catch { /* Keep saved current. */ }
    setOriginal(current);
    setProfile(getRuntimeProfile());
    try { setPrompt(localStorage.getItem(draftKey) || ""); } catch { /* Storage may be disabled. */ }
    setReady(true);
    return () => controller.current?.abort();
  }, [draftKey, fixing]);

  useEffect(() => {
    if (ready) try { localStorage.setItem(draftKey, prompt); } catch { /* Keep the draft in memory. */ }
  }, [prompt, ready, draftKey]);

  useEffect(() => {
    if (ready && fixing) try { localStorage.setItem("scriptrush_fix_script_draft_v2", original); } catch { /* Keep edited script in memory. */ }
  }, [original, ready, fixing]);

  const persistSelection = (selection: GameSelection) => {
    try { setSelection(selection); } catch (issue) { setNotice(message(issue)); }
  };

  async function identify(signal?: AbortSignal) {
    if (!game.trim()) throw new Error("Enter a game name, Roblox URL, or Place ID.");
    setResearching(true);
    try {
      const found = await researchGame(game.trim(), signal);
      const selection = { game: found.game || found.name, placeId: found.placeId, universeId: found.universeId };
      setIdentified(selection);
      setGame(selection.game);
      persistSelection(selection);
      return selection;
    } finally { setResearching(false); }
  }

  async function identifyOnly() {
    if (submitted.current || researching) return;
    submitted.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    try { await identify(abort.signal); } catch (issue) { setError(message(issue)); }
    finally { submitted.current = false; controller.current = null; }
  }

  function saveResult(script: string, selection: GameSelection, old: string, usedProfile: boolean) {
    let source = fixing ? readHistory().find((entry) => entry.script === old && entry.placeId === selection.placeId && entry.gameName === selection.game) : undefined;
    if (fixing && old.trim() && !source) {
      source = addHistory({ type: "generated", gameName: selection.game, placeId: selection.placeId, prompt: "Original script before correction", script: old, runtimeProfileUsed: false });
    }
    const entry = addHistory({ type: fixing ? "fixed" : "generated", gameName: selection.game, placeId: selection.placeId, prompt: prompt.trim(), script, sourceVersionId: source?.id ?? null, runtimeProfileUsed: usedProfile });
    setCurrentScript(script);
    if (!fixing) try { localStorage.removeItem("scriptrush_fix_script_draft_v2"); } catch { /* Keep in-memory result. */ }
    setSaved(entry);
    return entry;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitted.current || fileReading.current) return;
    if (!prompt.trim()) { setError(fixing ? "Paste the error or describe the requested change." : "Describe what the script should do."); return; }
    if (fixing && !original.trim()) { setError("Paste your current script before requesting a correction."); return; }
    submitted.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setError(""); setNotice(""); setBusy(true); setStartedAt(Date.now());
    setStage("Understanding request");
    const old = original;
    try {
      setStage("Identifying game · researching public evidence");
      const selection = await identify(abort.signal);
      if (abort.signal.aborted) throw new DOMException("Stopped", "AbortError");
      const loaded = profile && profileMatches(profile, selection) ? profile : null;
      const sources = [...files];
      if (loaded) sources.unshift(createProfileSource(loaded));
      setStage(loaded ? "Working… runtime profile included. The backend is planning and writing Luau." : "Working… the backend is selecting features, planning, and writing Luau.");
      const output = await generateScript({ game: selection.game, placeId: selection.placeId, mode, prompt: prompt.trim(), sources, ...(fixing ? { currentScript: old } : {}) }, abort.signal);
      if (abort.signal.aborted) throw new DOMException("Stopped", "AbortError");
      setStage("Checking output · finalizing");
      // generateScript validates the complete response before any saved data changes.
      setResult(output.script); setPrevious(old); setSaved(undefined); setCompare(false);
      try {
        saveResult(output.script, selection, old, Boolean(loaded));
        setOriginal(output.script);
        setNotice("Complete script received and saved as a new version. Test it in the target game to confirm behavior.");
      } catch (storageIssue) {
        setNotice("Your result is ready. " + message(storageIssue) + " Copy or download it to keep a backup.");
      }
    } catch (issue) {
      setError(abort.signal.aborted ? "Generation stopped. Your request and current script were preserved." : message(issue));
    } finally {
      setBusy(false); setResearching(false); submitted.current = false; controller.current = null;
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list || submitted.current) return;
    fileReading.current = true;
    setError("");
    try {
      if (list.length > 5) throw new Error("Add up to five text files at a time.");
      const sources: Source[] = [];
      for (const file of Array.from(list)) {
        if (!/\.(lua|luau|txt|log|json|md|rbxlx)$/i.test(file.name)) throw new Error("Use Lua, Luau, text, JSON, log, Markdown, or .rbxlx files.");
        if (file.size > 750000) throw new Error(`${file.name} is too large. Maximum file size is 750 KB.`);
        const content = await file.text();
        if (content.length > 76000) throw new Error(`${file.name} exceeds the 76,000 character limit. Add a smaller relevant excerpt.`);
        sources.push({ name: file.name, content, size: file.size });
      }
      setFiles(sources);
    } catch (issue) { setError(message(issue)); }
    finally { fileReading.current = false; }
  }

  function rollback() {
    try {
      setCurrentScript(previous); setOriginal(previous); setResult(""); setSaved(undefined); setCompare(false);
      setNotice("Previous script restored. Both versions remain in History.");
    } catch (issue) { setError(message(issue)); }
  }

  return <>
    <header className="page-heading"><span className="eyebrow">{fixing ? "KEEP WHAT WORKS" : "FROM IDEA TO LUAU"}</span><h1>{fixing ? "Fix Your Current Script" : "Create a Roblox Script"}</h1><p>{fixing ? "Repair an error or improve a feature. Keep your current script and its working systems." : "Choose a game, describe your idea, and get one complete script."}</p></header>
    <div className="workspace-grid">
      <div className="workspace-main">
        <form className="panel" onSubmit={submit}>
          <GameSelector value={game} onChange={(value) => { setGame(value); setIdentified(undefined); persistSelection({ game: value, placeId: "" }); }} onIdentify={() => void identifyOnly()} identified={identified} loading={researching || busy} />
          <div className="divider" />
          <div className="field"><label htmlFor="script-request">{fixing ? "Error or requested change" : "What should the script do?"}</label><textarea id="script-request" rows={6} placeholder={fixing ? "Paste the error, line number, or describe what to improve…" : "Describe what the script should do…"} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={busy} maxLength={30000} required /></div>
          {!fixing && <div className="presets" aria-label="Quick presets">{presets.map(([label, value]) => <button className="chip" type="button" key={label} onClick={() => setPrompt(value)} disabled={busy}>{label}</button>)}<Link className="chip" href="/fix">Improve Existing Script ↗</Link></div>}
          {fixing && <div className="field"><label htmlFor="current-script">Current script <span className="muted">· sent in full</span></label><textarea id="current-script" className="code-input" spellCheck={false} rows={12} value={original} onChange={(event) => setOriginal(event.target.value)} placeholder="Paste your current Luau script…" disabled={busy} required /><p className="hint">Your original stays intact until a complete corrected version arrives.</p></div>}
          <details className="advanced"><summary>Optional context <span className="muted">Files & game profile</span></summary><div className="field"><label htmlFor="source-files">Add files <span className="muted">· optional</span></label><input id="source-files" type="file" multiple accept=".lua,.luau,.txt,.log,.json,.md,.rbxlx" disabled={busy} onChange={(event) => void addFiles(event.target.files)} /><p className="hint">Up to 5 text files, 750 KB each. Binary .rbxl files are not supported.</p></div>{files.length > 0 && <div className="file-list">{files.map((file) => <span key={file.name}>{file.name}</span>)}<button type="button" className="button ghost" onClick={() => setFiles([])}>Remove files</button></div>}
            <div className="profile-banner"><p>{profile ? `Runtime profile loaded · Place ${profile.game.placeId ?? "unknown"}` : "No runtime profile loaded. Files and scans are optional."}</p>{profile && identified && !profileMatches(profile, identified) && <p className="hint">This profile belongs to a different or unidentified place and will not be sent.</p>}<div className="actions"><Link href="/learn" className="button ghost">{profile ? "View profile" : "Learn a game"}</Link>{profile && <button type="button" className="button ghost" onClick={() => { try { setRuntimeProfile(null); setProfile(null); } catch (issue) { setError(message(issue)); } }}>Clear loaded profile</button>}</div></div>
          </details>
          <div className="actions"><button className="button primary" type="submit" disabled={!ready || busy || researching}>{busy ? "Working…" : fixing ? "Fix Current Script" : "Generate Script"}<span aria-hidden="true">↗</span></button><span className="hint">One complete script · No account required</span></div>
        </form>
        {busy && <GenerationProgress stage={stage} startedAt={startedAt} onStop={() => controller.current?.abort()} />}
        {error && <ErrorState message={error} onDismiss={() => setError("")} />}
        {notice && <div className="success-notice" role="status">{notice}</div>}
      </div>
      <aside className="workspace-aside"><div className="panel"><span className="eyebrow">{fixing ? "CONTINUITY FIRST" : "BETTER CONTEXT, BETTER CODE"}</span><h2>{fixing ? "A patch, with a safety net." : "Build around the real game."}</h2><p className="muted">{fixing ? "Your full script, error, and matching game profile go together. Every successful correction creates a new version." : "ScriptRush uses public research and your optional runtime profile. Features depend on what the game actually supports."}</p><div className="divider" /><Link href={fixing ? "/history" : "/learn"} className="text-link">{fixing ? "Browse previous versions" : "Scan a game for better accuracy"} →</Link></div></aside>
    </div>
    <section className="result-section" aria-label="Script result">
      {result ? <><ScriptEditor script={result} title={fixing ? "Corrected script" : "Your complete script"} filename={fixing ? "scriptrush-fixed.lua" : "scriptrush-script.lua"}><div className="actions">{fixing ? <><button type="button" className="button secondary" onClick={() => setCompare(!compare)}>{compare ? "Hide Comparison" : "Compare with Previous"}</button><button type="button" className="button ghost" onClick={() => { try { setCurrentScript(result); setOriginal(result); setNotice("Corrected version set as current."); } catch (issue) { setError(message(issue)); } }}>Save as Current</button><button type="button" className="button ghost" onClick={rollback}>Rollback</button></> : <Link className="button secondary" href="/fix">Fix This Script →</Link>}<button type="button" className="button ghost" disabled={Boolean(saved)} onClick={() => { try { if (identified) { saveResult(result, identified, previous, Boolean(profile && profileMatches(profile, identified))); setNotice("Saved to History."); } } catch (issue) { setError(message(issue)); } }}>{saved ? "Saved to History ✓" : "Save to History"}</button><Link className="button ghost" href="/history">History ↗</Link></div></ScriptEditor>{compare && <div className="comparison-grid"><div className="panel"><h3>Local comparison</h3><p className="muted">Previous: {comparison.beforeLines} lines · {previous.length.toLocaleString()} characters</p><p className="muted">New: {comparison.afterLines} lines · {result.length.toLocaleString()} characters</p><p className="hint">{comparison.changed} changed line positions (approximate; not a semantic diff).</p></div><ScriptEditor script={previous} title="Previous version" filename="scriptrush-previous.lua" /></div>}</> : <EmptyState title={fixing ? "Your corrected version will appear here" : "Your script starts here"} description={fixing ? "The original script is preserved if a request fails or is stopped." : "Describe your idea above. The complete result will be ready to copy, download, or save."} />}
    </section>
  </>;
}
