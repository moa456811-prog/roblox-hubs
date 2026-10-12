"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchScanner } from "../lib/api";
import { parseRuntimeProfile } from "../lib/validation";
import { getRuntimeProfile, setRuntimeProfile, getSelection, setSelection } from "../lib/storage";
import type { RuntimeProfile } from "../lib/types";
import { ProfileSummary } from "../components/profile-summary";
import { ScriptEditor } from "../components/script-editor";
import { ErrorState } from "../components/error-state";
import { EmptyState } from "../components/empty-state";
import { copyText, downloadText } from "./browser-files";

const steps = ["Get and copy the live scanner.", "Run it inside your target Roblox game.", "Use Quick Scan, Deep Scan, or Record Before / Record After.", "Export the report, paste it below, and import the profile."];

export function LearnWorkspace() {
  const [scanner, setScanner] = useState("");
  const [report, setReport] = useState("");
  const [profile, setProfile] = useState<RuntimeProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const reportRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setProfile(getRuntimeProfile()); return () => controller.current?.abort(); }, []);

  async function getScanner() {
    if (busyRef.current) return;
    busyRef.current = true;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setNotice("");
    try { setScanner(await fetchScanner(abort.signal)); }
    catch (issue) { if (!abort.signal.aborted) setError(issue instanceof Error ? issue.message : "Scanner unavailable. Try again shortly."); }
    finally { setBusy(false); busyRef.current = false; controller.current = null; }
  }

  function importReport() {
    setError(""); setNotice("");
    try {
      const next = parseRuntimeProfile(report);
      setRuntimeProfile(next);
      const selected = getSelection();
      setProfile(next);
      setNotice("Game profile imported. Matching future requests will include this report.");
      try {
        if (next.game.placeId) setSelection({ game: next.game.name || (String(next.game.placeId) === selected.placeId ? selected.game : `Roblox place ${next.game.placeId}`), placeId: String(next.game.placeId) });
      } catch {
        setNotice("Profile imported, but this browser could not update the selected game. Select the matching game on Create.");
      }
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Invalid scanner report. Your previous profile is preserved."); }
  }

  return <>
    <header className="page-heading"><span className="eyebrow">LEARN THE REAL GAME</span><h1>Teach ScriptRush How the Game Works</h1><p>Run the read-only scanner inside the live Roblox game with your executor. It observes client-visible game systems and creates a profile that improves future scripts.</p></header>
    <div className="workspace-grid">
      <div className="workspace-main">
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">01 · OBSERVE</span><h2>A closer look at your game.</h2></div><span className="chip">Read-only</span></div><ol className="workflow-steps">{steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="actions"><button className="button primary" onClick={() => void getScanner()} disabled={busy}>{busy ? "Retrieving scanner…" : scanner ? "Refresh Live Scanner" : "Get Live Scanner"}<span aria-hidden="true">↗</span></button></div></section>
        {scanner && <ScriptEditor script={scanner} title="Live game scanner" filename="scriptrush-live-scanner.lua" />}
        <section className="panel"><span className="eyebrow">02 · IMPORT</span><h2>Bring the game context back.</h2><div className="field"><label htmlFor="runtime-report">Scanner report</label><textarea ref={reportRef} id="runtime-report" className="code-input" rows={9} value={report} onChange={(event) => setReport(event.target.value)} placeholder={'[SCRIPTRUSH_RUNTIME_PROFILE]\n{"game":{"placeId":2753915549},"scan":{…}}'} maxLength={750000} spellCheck={false} /><p className="hint">Paste the exported report or its JSON. Your existing profile is kept if validation fails.</p></div><button className="button primary" onClick={importReport}>Import Game Profile <span aria-hidden="true">↗</span></button></section>
        {error && <ErrorState message={error} onDismiss={() => setError("")} />}
        {notice && <div className="success-notice" role="status">{notice}</div>}
      </div>
      <aside className="workspace-aside"><section className="panel"><span className="eyebrow">VISIBLE INFORMATION ONLY</span><h2>Live game. Clear boundaries.</h2><p className="muted">Runs in the Roblox client, not just Roblox Studio. The scanner observes local instances without invoking RemoteEvents or RemoteFunctions.</p><div className="divider" /><p className="muted">It cannot see private server code. Confidence describes evidence in the report, not a guarantee that a feature works.</p></section></aside>
    </div>
    <section className="result-section" aria-label="Imported game profile">{profile ? <><ProfileSummary profile={profile} /><div className="actions"><Link href="/create" className="button primary">Continue to Create Script →</Link><button className="button secondary" onClick={() => { setReport(""); reportRef.current?.focus(); reportRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>Replace profile</button><button className="button ghost" onClick={() => { void copyText("[SCRIPTRUSH_RUNTIME_PROFILE]" + JSON.stringify(profile)).then(() => setNotice("Report copied.")).catch((issue) => setError(issue.message)); }}>Copy report</button><button className="button ghost" onClick={() => downloadText(JSON.stringify(profile, null, 2), "scriptrush-runtime-profile.json", "application/json")}>Export profile JSON</button><button className="button ghost" onClick={() => { try { setRuntimeProfile(null); setProfile(null); setNotice("Profile cleared."); } catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to clear profile."); } }}>Clear profile</button></div></> : <EmptyState title="Your game profile will appear here" description="Import a report to see observed systems and the evidence available for future scripts." />}</section>
  </>;
}
