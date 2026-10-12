"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readHistory, deleteHistory, clearHistory, importHistory, exportHistory, setCurrentScript, setSelection } from "../lib/storage";
import type { HistoryEntry } from "../lib/types";
import { ScriptEditor } from "../components/script-editor";
import { ErrorState } from "../components/error-state";
import { EmptyState } from "../components/empty-state";
import { copyText, downloadText } from "./browser-files";

export function HistoryWorkspace() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [opened, setOpened] = useState<HistoryEntry>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setEntries(readHistory());
    const refresh = () => setEntries(readHistory());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  function run(action: () => void) { setError(""); try { action(); } catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to update local history."); } }

  function select(entry: HistoryEntry, fix = false) {
    run(() => {
      setCurrentScript(entry.script); try { localStorage.removeItem("scriptrush_fix_script_draft_v2"); } catch { /* Current script is already preserved. */ } setSelection({ game: entry.gameName, placeId: entry.placeId });
      setNotice("Version set as current. Saved history is unchanged.");
      if (fix) router.push("/fix");
    });
  }

  async function importFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      if (file.size > 10000000) throw new Error("History file is too large. Maximum size is 10 MB.");
      const imported = importHistory(await file.text());
      setEntries(imported); setNotice("History imported. Existing versions were merged safely.");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Invalid history file. Existing versions were preserved."); }
  }

  return <>
    <header className="page-heading"><span className="eyebrow">YOUR SCRIPT LIBRARY</span><h1>Every version. A way back.</h1><p>Generated scripts, targeted fixes, and previous versions. Saved on this browser, without an account.</p></header>
    <section className="panel"><div className="panel-heading"><div><h2>Saved scripts <span className="muted">{entries.length} / 25</span></h2><p className="hint">Export a backup before clearing browser data or moving to another device.</p></div><div className="actions"><button className="button secondary" onClick={() => run(() => downloadText(exportHistory(), "scriptrush-history.json", "application/json"))}>Export History</button><label className="button secondary" htmlFor="history-import">Import History</label><input className="visually-hidden" id="history-import" type="file" accept=".json,application/json" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /><button className="button ghost" disabled={!entries.length} onClick={() => setConfirmClear(true)}>Clear All</button></div></div>
      {confirmClear && <div className="error-state" role="alert"><p>Clear all saved versions on this browser? Your current script stays available.</p><div className="actions"><button className="button danger" onClick={() => run(() => { clearHistory(); setEntries([]); setOpened(undefined); setConfirmClear(false); setNotice("History cleared. Your current script was preserved."); })}>Confirm Clear All</button><button className="button secondary" onClick={() => setConfirmClear(false)}>Keep History</button></div></div>}
    </section>
    {error && <ErrorState message={error} onDismiss={() => setError("")} />}{notice && <div className="success-notice" role="status">{notice}</div>}
    {entries.length ? <div className="history-grid">{entries.map((entry, index) => <article className="panel history-card" key={entry.id}><div className="panel-heading"><span className="chip">{entry.type === "fixed" ? "Fixed" : "Generated"} · V{entries.length - index}</span><span className="muted">{new Date(entry.createdAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</span></div><h2>{entry.gameName || "Roblox script"}</h2><p className="history-prompt">{entry.prompt}</p><div className="history-meta"><span>{entry.lineCount} lines</span><span>{entry.characterCount.toLocaleString()} characters</span>{entry.runtimeProfileUsed && <span>Profile used</span>}</div><div className="actions"><button className="button secondary" onClick={() => setOpened(entry)}>Open</button><button className="button ghost" onClick={() => { void copyText(entry.script).then(() => setNotice("Script copied.")).catch((issue) => setError(issue.message)); }}>Copy</button><button className="button ghost" onClick={() => downloadText(entry.script, "scriptrush-" + entry.id.replace(/[^a-z0-9-]/gi, "").slice(0, 30) + ".lua")}>Download</button><button className="button ghost" onClick={() => select(entry)}>Set as Current</button><button className="button ghost" onClick={() => select(entry, true)}>Fix →</button><button className="button ghost" onClick={() => { const source = entries.find((candidate) => candidate.id === entry.sourceVersionId); if (source) select(source); else select(entry); }}>Rollback</button><button className="button ghost" onClick={() => run(() => { deleteHistory(entry.id); setEntries(readHistory()); if (opened?.id === entry.id) setOpened(undefined); })}>Delete</button></div></article>)}</div> : <EmptyState title="A fresh start for your scripts" description="Create your first script or import a history backup. Your latest 25 versions will live here."><Link className="button primary" href="/create">Create Script →</Link></EmptyState>}
    {opened && <section className="result-section"><ScriptEditor script={opened.script} title={opened.gameName || "Saved version"} filename="scriptrush-saved.lua"><div className="actions"><button className="button secondary" onClick={() => select(opened, true)}>Fix This Script →</button><button className="button ghost" onClick={() => setOpened(undefined)}>Close version</button></div></ScriptEditor></section>}
  </>;
}
