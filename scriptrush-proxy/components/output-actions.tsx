"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Use the selection fallback when clipboard permissions are denied. */ }
  }
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  field.setAttribute("aria-hidden", "true");
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  previous?.focus();
  if (!copied) throw new Error("Clipboard access is unavailable. Select the script and copy it manually.");
}

export function downloadText(text: string, filename: string, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|]/g, "-");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OutputActions({ script, filename = "scriptrush.lua" }: { script: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  async function copy() {
    try {
      await copyText(script);
      setError("");
      setCopied(true);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 2200);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not copy the script."); }
  }
  return <div className="output-actions"><div className="actions"><button type="button" className="button secondary small" disabled={!script.trim()} onClick={copy}><Icon name={copied ? "check" : "copy"} size={16} />{copied ? "Copied!" : "Copy"}</button><button type="button" className="button ghost small" disabled={!script.trim()} onClick={() => downloadText(script, filename)}><Icon name="download" size={16} /><span>Download .lua</span></button></div><span className="sr-only" role="status">{copied ? "Script copied to clipboard." : ""}</span>{error && <p className="action-error" role="alert">{error}</p>}</div>;
}

export default OutputActions;
