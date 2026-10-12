import type { GameSelection, HistoryEntry, HistoryInput, RuntimeProfile } from "./types.ts";
import { lineCount, normalizeHistoryEntry, parseHistoryImport, parseRuntimeProfile, ValidationError } from "./validation.ts";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const HISTORY_LIMIT = 25;
export const STORAGE_KEYS = {
  selection: "scriptrush_selection_v2",
  current: "scriptrush_current_script_v2",
  profile: "scriptrush_runtime_profile_v2",
  history: "scriptrush_history_v2",
} as const;

export class StorageError extends Error {
  constructor(message = "This browser could not save your data. Export a copy before closing this page.") {
    super(message);
    this.name = "StorageError";
  }
}

function browserStorage(provided?: StorageLike): StorageLike | null {
  if (provided) return provided;
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

function get(key: string, storage: StorageLike | null): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function decode(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function write(key: string, value: unknown, storage: StorageLike | null): void {
  if (!storage) throw new StorageError();
  try { storage.setItem(key, JSON.stringify(value)); } catch { throw new StorageError(); }
}

// Migration is copy-only. Legacy keys are retained even if a new write fails.
function migrate(key: string, value: unknown, storage: StorageLike | null): void {
  if (get(key, storage) !== null) return;
  try { write(key, value, storage); } catch { /* Reading still returns the untouched legacy value. */ }
}

export function getSelection(provided?: StorageLike): GameSelection {
  const storage = browserStorage(provided);
  const value = decode(get(STORAGE_KEYS.selection, storage));
  if (value?.version === 2 && typeof value.game === "string" && typeof value.placeId === "string") {
    return { game: value.game, placeId: value.placeId };
  }
  const selection = { game: get("sr_game", storage) ?? "", placeId: get("sr_place", storage) ?? "" };
  if (selection.game || selection.placeId) migrate(STORAGE_KEYS.selection, { version: 2, ...selection }, storage);
  return selection;
}

export function setSelection(selection: GameSelection, provided?: StorageLike): void {
  if (typeof selection.game !== "string" || typeof selection.placeId !== "string") throw new ValidationError("Invalid game selection.");
  write(STORAGE_KEYS.selection, { version: 2, game: selection.game, placeId: selection.placeId }, browserStorage(provided));
}

export function getCurrentScript(provided?: StorageLike): string {
  const storage = browserStorage(provided);
  const value = decode(get(STORAGE_KEYS.current, storage));
  if (value?.version === 2 && typeof value.script === "string") return value.script;
  const legacy = get("scriptrush_current_script", storage) ?? "";
  if (legacy) migrate(STORAGE_KEYS.current, { version: 2, script: legacy }, storage);
  return legacy;
}

export function setCurrentScript(script: string, provided?: StorageLike): void {
  if (typeof script !== "string") throw new ValidationError("Invalid current script.");
  // Do not trim, shorten, parse or validate a user's manually pasted script here.
  write(STORAGE_KEYS.current, { version: 2, script }, browserStorage(provided));
}

export function getRuntimeProfile(provided?: StorageLike): RuntimeProfile | null {
  const storage = browserStorage(provided);
  const value = decode(get(STORAGE_KEYS.profile, storage));
  if (value?.version === 2 && value.profile === null) return null;
  if (value?.version === 2 && value.profile) {
    try { return parseRuntimeProfile(JSON.stringify(value.profile)); } catch { /* Keep invalid data and try the legacy copy. */ }
  }
  const legacy = get("scriptrush_runtime_profile", storage);
  if (!legacy) return null;
  try {
    const profile = parseRuntimeProfile(legacy);
    migrate(STORAGE_KEYS.profile, { version: 2, profile }, storage);
    return profile;
  } catch { return null; }
}

export function setRuntimeProfile(profile: RuntimeProfile | null, provided?: StorageLike): void {
  const validated = profile === null ? null : parseRuntimeProfile(JSON.stringify(profile));
  // A null tombstone prevents a deliberately cleared profile from reappearing.
  write(STORAGE_KEYS.profile, { version: 2, profile: validated }, browserStorage(provided));
}

function newest(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, HISTORY_LIMIT);
}

function historyData(storage: StorageLike | null): { entries: HistoryEntry[]; raw: string | null; corrupt: boolean } {
  const raw = get(STORAGE_KEYS.history, storage);
  if (raw === null) return { entries: [], raw, corrupt: false };
  try { return { entries: newest(parseHistoryImport(raw)), raw, corrupt: false }; }
  catch {
    // Show individually valid versions when possible, retaining the original
    // bytes for recovery before any later mutation can replace the record.
    const parsed = decode(raw);
    let rows: unknown[] = [];
    try { const value: unknown = JSON.parse(raw); rows = Array.isArray(value) ? value : Array.isArray(parsed?.entries) ? parsed.entries : []; } catch { /* Invalid JSON remains recoverable as raw bytes. */ }
    const entries: HistoryEntry[] = [];
    for (const row of rows) { try { entries.push(normalizeHistoryEntry(row)); } catch { /* Skip only this invalid version in the display. */ } }
    return { entries: newest(entries), raw, corrupt: true };
  }
}

export function readHistory(provided?: StorageLike): HistoryEntry[] {
  return historyData(browserStorage(provided)).entries;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
}

function saveHistory(entries: HistoryEntry[], storage: StorageLike | null): HistoryEntry[] {
  const previous = historyData(storage);
  if (previous.corrupt && previous.raw !== null) {
    if (!storage) throw new StorageError();
    try { storage.setItem(STORAGE_KEYS.history + "_recovery_" + newId(), previous.raw); }
    catch { throw new StorageError("The saved history needs recovery and could not be backed up. Export it before making changes."); }
  }
  const retained = newest(entries);
  write(STORAGE_KEYS.history, { version: 2, entries: retained }, storage);
  return retained;
}

export function addHistory(input: HistoryInput, provided?: StorageLike): HistoryEntry {
  const storage = browserStorage(provided);
  const entries = readHistory(storage ?? undefined);
  let id = input.id || newId();
  while (entries.some((entry) => entry.id === id)) id = newId();
  const entry = normalizeHistoryEntry({
    ...input, id, createdAt: input.createdAt ?? new Date().toISOString(),
    sourceVersionId: input.sourceVersionId ?? null, runtimeProfileUsed: input.runtimeProfileUsed ?? false,
    lineCount: lineCount(input.script), characterCount: input.script.length,
  });
  saveHistory([entry, ...entries], storage);
  return entry;
}

export function deleteHistory(id: string, provided?: StorageLike): void {
  const storage = browserStorage(provided);
  saveHistory(readHistory(storage ?? undefined).filter((entry) => entry.id !== id), storage);
}

export function clearHistory(provided?: StorageLike): void {
  saveHistory([], browserStorage(provided));
}

export function exportHistory(provided?: StorageLike): string {
  const data = historyData(browserStorage(provided));
  // Export the original corrupt record, rather than silently losing recoverable
  // versions. A user can save it even when the browser storage is full.
  if (data.corrupt && data.raw !== null) return data.raw;
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), entries: data.entries }, null, 2);
}

export function importHistory(raw: string, provided?: StorageLike): HistoryEntry[] {
  const incoming = parseHistoryImport(raw); // Validate the entire file before writing anything.
  const storage = browserStorage(provided);
  const merged = [...readHistory(storage ?? undefined)];
  for (const entry of incoming) {
    const existing = merged.find((version) => version.id === entry.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(entry)) continue;
    const candidate = { ...entry };
    while (merged.some((version) => version.id === candidate.id)) candidate.id = newId();
    merged.push(candidate);
  }
  return saveHistory(merged, storage);
}
