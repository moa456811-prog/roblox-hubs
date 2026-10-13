"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ScriptEditor } from "../components/script-editor";
import { ErrorState } from "../components/error-state";
import { getCurrentScript, getSelection } from "../lib/storage";
import { downloadText } from "../components/output-actions";
import { projectZip } from "../lib/project-download";
import { clearKnowledgeSession, createKnowledge, createKnowledgeRequest, feedbackKnowledge, fileLineDiff, getKnowledge, getKnowledgeFiles, knowledgeSources, KNOWLEDGE_STAGES, loadKnowledgeSession, record, rollbackKnowledge, runKnowledge, saveKnowledgeSession, verificationLabel, type KnowledgeFile, type KnowledgeJob, type KnowledgeRole, type KnowledgeSession } from "../lib/knowledge-v2";
import styles from "./knowledge-workflow.module.css";

const text = (value: unknown, fallback = "Unknown"): string => typeof value === "string" || typeof value === "number" ? String(value) : fallback;
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(record) : [];
function safeLink(value: unknown): string | undefined { try { const url = new URL(text(value, "")); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } }
function planTexts(value: unknown): string[] { return Array.isArray(value) ? value.flatMap(item => typeof item === "string" ? [item] : record(item) ? [text(item.description ?? item.reason ?? item.label ?? item.id, "Unspecified evidence")] : []) : []; }

function VerificationDetails({ value }: { value: unknown }) {
  const report = record(value) ? value : {};
  return <div aria-label="Verification details"><ul>{[["Compilation", "compilation"], ["Simulated tests", "mockTests"], ["Observed in-game tests", "inGameTests"]].map(([label, key]) => {
    const check = record(report[key]) ? report[key] : {};
    return <li key={key}>{label}: {text(check.status, "not_run")} · {check.executed === true ? "executed" : "not executed"}{planTexts(check.evidence).length ? <details><summary>Evidence</summary><ul>{planTexts(check.evidence).map((line, index) => <li key={index}>{line}</li>)}</ul></details> : null}</li>;
  })}</ul>{planTexts(report.issues).length ? <ul role="alert">{planTexts(report.issues).map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}</div>;
}

function Evidence({ job, role }: { job: KnowledgeJob; role: KnowledgeRole }) {
  const plan = record(job.plan) ? job.plan : {};
  const generation = record(job.generationReport) ? job.generationReport : {};
  const discovery = record(job.discovery) ? job.discovery : {};
  const sources = knowledgeSources(job);
  const [filter, setFilter] = useState("all");
  const shown = filter === "all" ? sources : sources.filter(source => source.roles.includes(filter));
  const unknowns = [...new Set([...planTexts(plan.unknowns), ...planTexts(generation.unknowns)])];
  const proofs = [...new Set(rows(plan.features).flatMap(feature => planTexts(feature.missingEvidence)))];
  return <section className="panel" aria-label="Knowledge and plan evidence"><h2>Game evidence & plan</h2><p className="hint">Execution role: {role.replaceAll("_", " ")} · Public identity and source references do not prove in-game behavior.</p>
    {job.discovery ? <p className="muted">Game: {text(discovery.name ?? (record(discovery.game) ? discovery.game.name : undefined), "Identity pending")} · Place {text(discovery.placeId ?? discovery.place_id ?? (record(discovery.identity) ? discovery.identity.placeId : undefined))}</p> : null}
    <div className={styles.controls}><label htmlFor="knowledge-source-role">Source role filter</label><select id="knowledge-source-role" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All returned sources</option>{[...new Set(sources.flatMap(source => source.roles))].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
    <ul className={styles.sourceList}>{shown.map(source => { const url = safeLink(source.url); return <li key={source.id}><strong>{url ? <a href={url} target="_blank" rel="noreferrer">{source.title} ↗</a> : source.title}</strong><small>Roles: {source.roles.join(", ")} · License: {source.license}</small><small>Commit: {source.commit} · Import: {source.status}</small><small>Reference SHA-256: {source.sha256}</small>{source.warning ? <p className="hint">{source.warning}</p> : null}</li>; })}</ul>
    {!sources.length ? <p className="hint">No retrieved source provenance is available yet.</p> : null}
    {job.plan ? <><div className="divider" /><h3>Planned features</h3><ul>{rows(plan.features).map((feature, index) => <li key={text(feature.id, String(index))}>{text(feature.name ?? feature.id, "Requested feature")} · {text(feature.mechanismStatus, "Unverified")}</li>)}</ul><h3>Source observations</h3><ul>{rows(plan.evidence).map((proof, index) => <li key={text(proof.id, String(index))}>{text(proof.id)} · {text(proof.status, "UNKNOWN")} · {text(proof.excerpt, "No source observation")}<small className="hint"> Reference text is untrusted data; it does not establish a live game mechanism.</small></li>)}</ul><h3>Proof requirements</h3>{proofs.length ? <ul>{proofs.map((proof, index) => <li key={index}>{proof}</li>)}</ul> : <p className="hint">No proof has been supplied for unknown game mechanics.</p>}<h3>Unknowns</h3>{unknowns.length ? <ul>{unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul> : <p className="hint">Review each feature's verification result. An empty unknown list is not a success certificate.</p>}</> : null}
  </section>;
}

export function KnowledgeWorkflow({ mode }: { mode: "build" | "fix" }) {
  const [game, setGame] = useState("");
  const [request, setRequest] = useState("");
  const [role, setRole] = useState<KnowledgeRole>("project_client");
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<KnowledgeSession | null>(null);
  const [job, setJob] = useState<KnowledgeJob | null>(null);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [before, setBefore] = useState<KnowledgeFile[]>([]);
  const [selected, setSelected] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [patching, setPatching] = useState(mode === "fix");
  const [editing, setEditing] = useState(false);
  const [locallyEdited, setLocallyEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [feedback, setFeedback] = useState("");
  const working = useRef(false), pause = useRef(false), controller = useRef<AbortController | null>(null);
  const sessionRef = useRef<KnowledgeSession | null>(null);
  useEffect(() => {
    let cancelled = false;
    const selection = getSelection(); setGame(selection.placeId || selection.game);
    if (mode === "fix") { const content = getCurrentScript(); if (content) { setFiles([{ path: "main.luau", content }]); setSelected("main.luau"); } }
    const saved = loadKnowledgeSession(mode); setSession(saved); sessionRef.current = saved;
    if (saved) void getKnowledge(saved).then(restored => {
      if (cancelled) return;
      setJob(restored);
      if (restored.input?.request) setRequest(restored.input.request);
      if (restored.input?.game) setGame(restored.input.game);
      if (restored.role) setRole(restored.role);
    }).catch(() => { if (!cancelled) setNotice("The resume key is saved. Refresh Status to reconnect to the job service."); });
    setReady(true);
    return () => { cancelled = true; pause.current = true; controller.current?.abort(); };
  }, [mode]);

  function remember(value: KnowledgeSession) {
    sessionRef.current = value; setSession(value);
    try { saveKnowledgeSession(value); } catch (issue) { setNotice(issue instanceof Error ? issue.message : "Resume storage is unavailable. Keep this page open."); }
  }
  function showFiles(next: KnowledgeFile[]) { setFiles(next); setSelected(current => next.some(file => file.path === current) ? current : next[0]?.path ?? ""); setLocallyEdited(false); }
  async function refreshFiles(current: KnowledgeSession, currentJob: KnowledgeJob, force = false) {
    if (!currentJob.currentSnapshotId) return;
    if (locallyEdited && !force) { setNotice("Saved status refreshed. Your local edits were kept and remain Unverified; submit a targeted patch to validate them."); return; }
    const result = await getKnowledgeFiles(current, { signal: controller.current?.signal }); showFiles(result.files); setSnapshot(result.snapshotId ?? currentJob.currentSnapshotId);
  }
  async function drive(current: KnowledgeSession, retry = false, forceFiles = false) {
    const abort = new AbortController(); controller.current = abort;
    const next = await runKnowledge(current, { signal: abort.signal, onJob: setJob, onSession: remember, resumeFailed: retry });
    if (!abort.signal.aborted) await refreshFiles(sessionRef.current ?? current, next, forceFiles);
    if (next.status === "failed") setError("The saved step failed. Review the evidence and error before resuming; previous snapshots remain available.");
    else if (next.stage === "generation" && next.input?.allowModelProcessing === false) setNotice("Analysis and plan saved without a model call. Review the evidence, then allow model processing and create the project when ready.");
    else if (next.status === "ready") setNotice("Project files are ready. Verification is shown separately below.");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (working.current) return;
    let body;
    try { body = createKnowledgeRequest({ game, request, role, mode: patching ? "fix" : "build", files, consent }); } catch (issue) { setError(issue instanceof Error ? issue.message : "Check the request."); return; }
    working.current = true; pause.current = false; setBusy(true); setCreating(true); setError(""); setNotice(""); setBefore(files);
    try {
      // Creation is allowed to finish so a local pause cannot discard its only
      // capability response. Every subsequent operation is abortable/resumable.
      const created = await createKnowledge(body, mode); remember(created.session); setJob(created.job); setCreating(false);
      if (pause.current) setNotice("Job saved and paused. Resume it below when ready."); else await drive(created.session, false, true);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "The request could not finish. Your files were preserved."); }
    finally { working.current = false; setBusy(false); setCreating(false); controller.current = null; }
  }
  async function resume() {
    if (working.current || !sessionRef.current) return;
    working.current = true; pause.current = false; setBusy(true); setError(""); setNotice("");
    try { await drive(sessionRef.current, true); } catch (issue) { setError(issue instanceof Error ? issue.message : "Your job remains saved."); }
    finally { working.current = false; setBusy(false); controller.current = null; }
  }
  async function refresh() {
    if (working.current || !sessionRef.current) return;
    working.current = true; setBusy(true); setError(""); controller.current = new AbortController();
    try { const next = await getKnowledge(sessionRef.current, controller.current.signal); setJob(next); await refreshFiles(sessionRef.current, next); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "The saved job could not be refreshed."); }
    finally { working.current = false; setBusy(false); controller.current = null; }
  }
  async function addFiles(list: FileList | null) {
    if (!list || working.current) return;
    try {
      const next: KnowledgeFile[] = [];
      if (list.length > 16) throw new Error("Add up to 16 project files.");
      let total = 0;
      for (const file of Array.from(list)) { total += file.size; if (!/\.(lua|luau|json|md)$/i.test(file.name) || file.size > 160_000 || total > 600_000) throw new Error("Use Lua, Luau, JSON or Markdown files below 160 KB each and 600 KB in total."); next.push({ path: file.name, content: await file.text() }); }
      setBefore(files); showFiles(next); setLocallyEdited(true);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "The files could not be read."); }
  }
  async function compareSnapshot(id: string) {
    if (!session || !id || working.current) return;
    working.current = true; setBusy(true);
    try { const previous = await getKnowledgeFiles(session, { snapshotId: id }); setBefore(previous.files); setSnapshot(id); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "The snapshot could not be read."); }
    finally { working.current = false; setBusy(false); }
  }
  async function rollback() {
    if (!session || !snapshot || working.current) return;
    working.current = true; setBusy(true); setError("");
    try { const next = await rollbackKnowledge(session, snapshot); setBefore(files); setJob(next); await refreshFiles(session, next, true); setNotice("Snapshot restored. Verification must run again for the restored files."); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "The snapshot was not changed."); }
    finally { working.current = false; setBusy(false); }
  }
  function downloadProject() {
    const receiptPath = ".scriptrush-verification.json";
    const exported = [...files, ...(!files.some(file => file.path === receiptPath) ? [{ path: receiptPath, content: JSON.stringify({ jobId: job?.id, snapshotId: job?.currentSnapshotId, verification: locallyEdited ? { level: "DRAFT", reason: "Local edits have not been verified" } : job?.verification ?? { level: "DRAFT" } }, null, 2) }] : [])];
    const url = URL.createObjectURL(new Blob([projectZip(exported)], { type: "application/zip" }));
    const link = document.createElement("a"); link.href = url; link.download = "scriptrush-project.zip"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function report(kind: "worked" | "failed" | "issue") {
    if (!session || working.current) return;
    working.current = true; setBusy(true);
    try { const tested = job?.snapshots.find(item => item.id === job.currentSnapshotId); await feedbackKnowledge(session, { kind, ...(feedback.trim() ? { message: feedback.trim() } : {}), ...(tested ? { artifactSha256: tested.manifestSha256 } : {}) }); setNotice("Feedback recorded as a tester report. It does not establish an independently observed in-game result."); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Feedback was not saved."); }
    finally { working.current = false; setBusy(false); }
  }
  const active = files.find(file => file.path === selected);
  const old = before.find(file => file.path === selected);
  return <div className={styles.stack}>
    <header className="page-heading"><span className="eyebrow">KNOWLEDGE ENGINE V2 · OPTIONAL</span><h1>{patching ? "Patch Your Current Project" : "Build from Game Evidence"}</h1><p>Start with the game link. Review the sources, plan and verification, then download the complete project.</p></header>
    <form className="panel" onSubmit={submit}><div className="field"><label htmlFor="knowledge-game">Roblox game URL or Place ID</label><input id="knowledge-game" className="input" value={game} onChange={event => setGame(event.target.value)} placeholder="https://www.roblox.com/games/123456789/..." required disabled={busy} /><p className="hint">A game file is optional. Identifying a game does not reveal its private server code.</p></div>
      <div className="field"><label htmlFor="knowledge-role">Execution role</label><select className={styles.select} id="knowledge-role" value={role} onChange={event => setRole(event.target.value as KnowledgeRole)} disabled={busy}><option value="project_client">Project client</option><option value="project_server">Project server</option><option value="executor_client">Executor client</option></select><p className="hint">Source compatibility and available actions depend on this role.</p></div>
      <div className="field"><label htmlFor="knowledge-request">{patching ? "Error or targeted change" : "Requested features and UI"}</label><textarea id="knowledge-request" value={request} onChange={event => setRequest(event.target.value)} rows={6} maxLength={12_000} required disabled={busy} placeholder={patching ? "Paste the error and the feature or file that needs a targeted patch…" : "Describe all features, tabs, colors and a custom title if wanted. Generated UI labels must be in English…"} /></div>
      {patching && !job && files.length <= 1 ? <div className="field"><label htmlFor="knowledge-current">Current script</label><textarea id="knowledge-current" className="code-input" rows={8} value={files[0]?.content ?? ""} onChange={event => { const path = files[0]?.path ?? "main.luau"; setFiles([{ path, content: event.target.value }]); setSelected(path); setLocallyEdited(true); }} placeholder="Paste the current script or add your project files below…" disabled={busy} /></div> : null}
      <details className="advanced"><summary>Optional project files <span className="muted">{files.length} files loaded</span></summary><input type="file" aria-label="Add project files" multiple accept=".lua,.luau,.json,.md" disabled={busy} onChange={event => void addFiles(event.target.files)} /><p className="hint">Up to 16 files, 160 KB each and 600 KB in total. For a patch, the complete current files and the error are sent together. Review them in the editor below.</p></details>
      <label className={styles.consent}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} /><span>I allow ScriptRush to send this request and the current project files to its configured AI provider for generation or a targeted patch.</span></label>
      <div className="actions"><button className="button primary" disabled={!ready || busy} type="submit">{creating ? "Saving job…" : busy ? "Running saved steps…" : !consent ? "Analyze Game & Plan" : patching ? "Create Targeted Patch" : "Create Evidence-Based Project"}</button>{busy ? <button className="button ghost" type="button" onClick={() => { pause.current = true; controller.current?.abort(); setNotice(creating ? "Pausing after the job resume key has been saved…" : "Paused locally. The saved job and previous files remain available."); }}>Pause</button> : null}</div>
    </form>
    {session ? <section className="panel" aria-label="Saved project job"><h2>Saved job</h2><p className="hint">This browser keeps its resume key separately from your script history. Pausing stops this browser's request; an accepted server step may finish.</p><div className="actions"><button className="button secondary" disabled={busy} onClick={() => void resume()}>Resume Saved Job</button><button className="button ghost" disabled={busy} onClick={() => void refresh()}>Refresh Status</button><button className="button ghost" disabled={busy} onClick={() => { clearKnowledgeSession(mode); setSession(null); sessionRef.current = null; setJob(null); setNotice("Resume key removed from this browser. Download your files to keep them."); }}>Forget Resume Key</button><Link href="/history" className="text-link">Script History ↗</Link></div>
      {job ? <><p role="status">Current step: {job.stage} · {job.status}</p><ol className={styles.stages}>{KNOWLEDGE_STAGES.map(stage => { const entry = job.progress.find(item => item.stage === stage); return <li key={stage} data-state={entry?.status ?? "pending"}><span>{stage.charAt(0).toUpperCase() + stage.slice(1)}</span><span>{entry?.status ?? "pending"}{entry?.attempts ? ` · ${entry.attempts} attempt${entry.attempts === 1 ? "" : "s"}` : ""}{entry?.errorCode ? " · " + entry.errorCode : ""}</span></li>; })}</ol><span className={styles.badge}>{locallyEdited ? "Unverified" : verificationLabel(job.verification)}</span><VerificationDetails value={job.verification} /><p className="hint">Compilation and simulated tests do not establish live-game success. Tester reports remain distinct from observed results.</p></> : <p className="hint">Refresh or resume to load the durable job status.</p>}
    </section> : null}
    {error ? <ErrorState message={error} onDismiss={() => setError("")} /> : null}{notice ? <p className="success-notice" role="status">{notice}</p> : null}
    {job ? <Evidence job={job} role={job.role ?? role} /> : null}
    {files.length ? <section className={styles.stack} aria-label="Complete project files"><div className="panel"><h2>Project files</h2><p className="hint">{files.length} complete files · {locallyEdited ? "Local edits are unverified." : "Verification applies only to the saved snapshot."}</p><div className="actions"><button className="button secondary" onClick={downloadProject}>Download Complete Project .zip</button><button className="button ghost" disabled={busy} onClick={() => { setPatching(true); setConsent(false); setRequest(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Patch These Files</button>{job?.snapshots.length ? <><label htmlFor="knowledge-snapshot">Compare snapshot</label><select id="knowledge-snapshot" className={styles.select} disabled={busy} value={snapshot} onChange={event => void compareSnapshot(event.target.value)}>{job.snapshots.map(item => <option key={item.id} value={item.id}>{item.reason || item.id} · {item.createdAt}</option>)}</select><button className="button ghost" disabled={busy || !snapshot || snapshot === job.currentSnapshotId} onClick={() => void rollback()}>Restore Selected Snapshot</button></> : null}</div></div>
      <div className={styles.files}><nav className={styles.fileList} aria-label="Project file list">{files.map(file => <button key={file.path} aria-pressed={selected === file.path} onClick={() => { setSelected(file.path); setEditing(false); }}>{file.path}</button>)}</nav><div className={styles.stack}>{active ? <><div className={styles.controls}><span className={styles.badge}>{active.path}</span><button className="button ghost small" onClick={() => setEditing(!editing)}>{editing ? "View File" : "Edit Locally"}</button><button className="button ghost small" onClick={() => downloadText(active.content, active.path.split("/").pop()!)}>Download File</button></div>{editing ? <div className="field"><label htmlFor="knowledge-code">Local file editor · changes need validation</label><textarea id="knowledge-code" className={styles.code} spellCheck={false} value={active.content} onChange={event => { const content = event.target.value; setFiles(current => current.map(file => file.path === selected ? { path: file.path, content } : file)); setLocallyEdited(true); }} /></div> : /\.(lua|luau)$/i.test(active.path) ? <ScriptEditor script={active.content} title="Complete file" filename={active.path.split("/").pop()!} /> : <pre className={styles.diff}>{active.content}</pre>}{before.length ? <details className={styles.details}><summary>Exact change block for {active.path}</summary><pre className={styles.diff}>{fileLineDiff(old?.content ?? "", active.content)}</pre></details> : null}</> : null}</div></div>
      {job ? <section className="panel"><h3>Report a test result</h3><label className="sr-only" htmlFor="knowledge-feedback">Test scenario and result</label><textarea id="knowledge-feedback" rows={3} maxLength={8_000} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Describe the tested game version, scenario and observed error or result…" /><div className={styles.feedback}><button className="button ghost" disabled={busy || locallyEdited} onClick={() => void report("worked")}>Report Worked</button><button className="button ghost" disabled={busy || locallyEdited} onClick={() => void report("failed")}>Report Failed</button><button className="button ghost" disabled={busy || locallyEdited} onClick={() => void report("issue")}>Report Issue</button></div><p className="hint">Reports are recorded as reported evidence, never as independent in-game observation. Submit local edits as a patch before reporting a result for that version.</p></section> : null}
    </section> : null}
  </div>;
}
