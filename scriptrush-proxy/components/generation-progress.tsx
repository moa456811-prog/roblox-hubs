"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";

export function GenerationProgress({ stage, startedAt, onStop }: { stage: string; startedAt: number; onStop: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [startedAt]);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  return <div className="generation-progress" aria-busy="true"><div className="progress-top"><div className="progress-symbol"><Icon name="spark" size={22} /></div><div className="progress-copy"><span className="eyebrow">IN PROGRESS</span><h3 role="status" aria-live="polite">{stage || "Working…"}</h3><p>Your request stays here while ScriptRush works.</p></div><span className="elapsed-time" aria-label={`${elapsed} seconds elapsed`}><Icon name="clock" size={14} />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span></div><div className="progress-bottom"><span><span className="spinner" />Working…</span><button type="button" className="button ghost small" onClick={onStop}><span className="stop-square" />Stop</button></div></div>;
}

export default GenerationProgress;
