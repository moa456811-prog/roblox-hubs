"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./icon";
import { OutputActions } from "./output-actions";

export function ScriptEditor({ script, title = "Your script", filename = "scriptrush.lua", children }: { script: string; title?: string; filename?: string; children?: ReactNode }) {
  const [fullscreen, setFullscreen] = useState(false);
  const editor = useRef<HTMLElement>(null);
  const titleId = useId();
  const lines = useMemo(() => script ? script.split(/\r\n|\r|\n/) : [], [script]);
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    editor.current?.focus();
    function onEscape(event: globalThis.KeyboardEvent) { if (event.key === "Escape") setFullscreen(false); }
    window.addEventListener("keydown", onEscape);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onEscape); previous?.focus(); };
  }, [fullscreen]);
  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (!fullscreen || event.key !== "Tab") return;
    const focusable = editor.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');
    if (!focusable?.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === editor.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === editor.current)) { event.preventDefault(); first.focus(); }
  }
  return <section ref={editor} className={`script-editor${fullscreen ? " is-fullscreen" : ""}`} role={fullscreen ? "dialog" : undefined} aria-modal={fullscreen || undefined} aria-labelledby={titleId} tabIndex={-1} onKeyDown={trapFocus}>
    <div className="editor-toolbar"><div className="editor-title"><span className="file-icon"><Icon name="file" size={17} /></span><div><h3 id={titleId}>{title}</h3><span>{filename}</span></div><span className="language-tag">Luau</span></div><button className="button ghost small fullscreen-button" type="button" onClick={() => setFullscreen(value => !value)} aria-label={fullscreen ? "Exit full screen" : "Open script in full screen"}><Icon name={fullscreen ? "close" : "expand"} size={17} /><span>{fullscreen ? "Close" : "Full Screen"}</span></button></div>
    <div className="code-scroll" tabIndex={0} role="region" aria-label={`${title} code, scroll to read`}><div className="code-content"><pre className="line-numbers" aria-hidden="true">{lines.length ? lines.map((_, index) => index + 1).join("\n") : "1"}</pre><pre className={`code-text${!script ? " code-placeholder" : ""}`}><code>{script || "-- Your complete script will appear here."}</code></pre></div></div>
    <div className="editor-bottom"><div className="editor-stats"><span>{lines.length.toLocaleString()} lines</span><span>{script.length.toLocaleString()} characters</span><span className="editor-encoding">UTF-8</span></div><OutputActions script={script} filename={filename} /></div>
    {children && <div className="editor-extra-actions actions">{children}</div>}
    {fullscreen && <div className="fullscreen-hint">Press <kbd>Esc</kbd> to close</div>}
  </section>;
}

export default ScriptEditor;
