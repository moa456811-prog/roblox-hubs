"use client";

import { useId } from "react";
import { Icon } from "./icon";

export type GameSelectorProps = { value: string; onChange: (value: string) => void; onIdentify: () => void; identified?: { game: string; placeId: string } | null; loading?: boolean; error?: string };

export function GameSelector({ value, onChange, onIdentify, identified, loading = false, error }: GameSelectorProps) {
  const id = useId();
  return <div className="game-selector"><label htmlFor={id}>Roblox game</label><div className="game-input-row"><div className="input-with-icon"><Icon name="game" size={19} /><input id={id} className="input" value={value} disabled={loading} onChange={event => onChange(event.target.value)} placeholder="Game name, Roblox URL, or Place ID" autoComplete="off" aria-describedby={`${id}-hint`} aria-invalid={Boolean(error)} onKeyDown={event => { if (event.key === "Enter" && value.trim() && !loading) { event.preventDefault(); onIdentify(); } }} /></div><button type="button" className="button secondary identify-button" disabled={!value.trim() || loading} onClick={onIdentify}>{loading ? <><span className="spinner" />Identifying…</> : <>Identify<Icon name="arrow" size={15} /></>}</button></div><p className="hint" id={`${id}-hint`}>Use a game name, a link, or the number in its Roblox URL.</p>{identified && <div className="identified-game" role="status"><span className="identified-check"><Icon name="check" size={15} /></span><div><strong>{identified.game || "Identified game"}</strong><span>Place ID <code>{identified.placeId}</code></span></div><span className="identified-badge">Game identified</span></div>}{error && <p className="field-error" role="alert">{error}</p>}</div>;
}

export default GameSelector;
