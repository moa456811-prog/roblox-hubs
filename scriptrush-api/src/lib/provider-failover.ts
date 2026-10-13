import { throwIfCallerAborted, withProviderAbort } from "./provider-abort.ts";

export type ProviderUnavailableReason = "quota" | "capacity" | "timeout" | "upstream" | "network";

/** Only provider adapters classify failures. Arbitrary error text never triggers a second charge. */
export class ProviderUnavailableError extends Error {
  readonly reason: ProviderUnavailableReason;
  readonly status?: number;
  readonly retryAfter?: string | null;
  readonly resetAtMs?: number;

  constructor(reason: ProviderUnavailableReason, options: { status?: number; retryAfter?: string | null; resetAtMs?: number; cause?: unknown } = {}) {
    super(reason === "quota" || reason === "capacity" ? "RATE_LIMITED" : reason === "timeout" ? "AI_TIMEOUT" : `AI_RETRYABLE_${options.status || 502}`, { cause: options.cause });
    this.name = "ProviderUnavailableError";
    this.reason = reason;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.resetAtMs = options.resetAtMs;
  }
}

export const MAX_PROVIDER_HOPS = 4;
const MAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Best-effort memory for one process only; it is not a global or account quota ledger. */
export class ProviderCooldowns {
  private readonly entries = new Map<string, number>();
  private readonly maximumEntries: number;

  constructor(maximumEntries = 32) {
    this.maximumEntries = Math.max(1, Math.min(128, Math.floor(maximumEntries) || 32));
  }

  private prune(nowMs: number): void {
    for (const [id, until] of this.entries) if (until <= nowMs) this.entries.delete(id);
  }

  availableAt(id: string, nowMs: number): number | null {
    this.prune(nowMs);
    return this.entries.get(id) ?? null;
  }

  set(id: string, untilMs: number, nowMs: number): void {
    this.prune(nowMs);
    if (!Number.isFinite(untilMs) || !Number.isFinite(nowMs) || untilMs <= nowMs) return;
    this.entries.delete(id);
    this.entries.set(id, Math.min(untilMs, nowMs + MAX_COOLDOWN_MS));
    while (this.entries.size > this.maximumEntries) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(id: string): void { this.entries.delete(id); }
  get size(): number { return this.entries.size; }
}

function maySwitch(error: unknown): error is ProviderUnavailableError {
  if (!(error instanceof ProviderUnavailableError)) return false;
  const status = error.status;
  if (status !== undefined && status >= 400 && status < 500 && status !== 402 && status !== 429) return false;
  if (error.reason === "quota") return status === undefined || status === 402 || status === 429;
  if (error.reason === "capacity") return status === undefined || status === 429 || (status >= 500 && status <= 599);
  if (error.reason === "upstream") return status !== undefined && status >= 500 && status <= 599;
  return status === undefined || (status >= 500 && status <= 599);
}

function unavailableUntil(error: ProviderUnavailableError, nowMs: number): number {
  if (Number.isFinite(error.resetAtMs) && error.resetAtMs! > nowMs) return error.resetAtMs!;
  if (error.retryAfter) {
    const header = error.retryAfter.trim();
    const seconds = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : NaN;
    const until = Number.isFinite(seconds) ? nowMs + seconds * 1000 : Date.parse(header);
    if (Number.isFinite(until) && until > nowMs) return until;
  }
  return nowMs + (error.reason === "quota" ? 60_000 : error.reason === "capacity" ? 15_000 : 5000);
}

export type ProviderOperationBudget = { signal: AbortSignal; deadlineMs: number; remainingMs: number; attempt: number };
export type ProviderChainResult<T> = { value: T; providerId: string; attempts: string[] };

/** Retry the same stage on a different configured provider, never concatenate outputs or restart the job. */
export async function executeProviderChain<T, P extends { id: string }>(providers: readonly P[], options: {
  operation: (provider: P, budget: ProviderOperationBudget) => Promise<T>;
  signal?: AbortSignal;
  deadlineMs: number;
  now?: () => number;
  cooldowns?: ProviderCooldowns;
  onAttempt?: (providerId: string, attempt: number) => void;
}): Promise<ProviderChainResult<T>> {
  throwIfCallerAborted(options.signal);
  const now = options.now ?? Date.now;
  const seen = new Set<string>();
  const chain: P[] = [];
  for (const provider of providers) {
    if (!/^[a-z][a-z0-9_-]{0,47}$/.test(provider.id)) throw new Error("INVALID_PROVIDER_CONFIGURATION");
    if (!seen.has(provider.id)) { seen.add(provider.id); chain.push(provider); }
    if (chain.length === MAX_PROVIDER_HOPS) break;
  }
  if (!chain.length) throw new Error("AI_NOT_CONFIGURED");
  const remaining = options.deadlineMs - now();
  if (!Number.isFinite(remaining) || remaining < 1000) throw new Error("AI_TIMEOUT");

  return withProviderAbort(remaining, options.signal, async signal => {
    const attempts: string[] = [];
    let lastFailure: ProviderUnavailableError | undefined;
    let nextAvailable = Infinity;
    for (const provider of chain) {
      throwIfCallerAborted(options.signal);
      if (signal.aborted || options.deadlineMs - now() < 1000) throw new Error("AI_TIMEOUT");
      const availableAt = options.cooldowns?.availableAt(provider.id, now());
      if (availableAt) { nextAvailable = Math.min(nextAvailable, availableAt); continue; }
      attempts.push(provider.id);
      options.onAttempt?.(provider.id, attempts.length);
      try {
        const value = await options.operation(provider, { signal, deadlineMs: options.deadlineMs, remainingMs: options.deadlineMs - now(), attempt: attempts.length });
        throwIfCallerAborted(options.signal);
        if (signal.aborted || options.deadlineMs - now() <= 0) throw new Error("AI_TIMEOUT");
        options.cooldowns?.clear(provider.id);
        return { value, providerId: provider.id, attempts };
      } catch (error) {
        throwIfCallerAborted(options.signal);
        if (signal.aborted || options.deadlineMs - now() < 1000) throw new Error("AI_TIMEOUT");
        if (!maySwitch(error)) throw error;
        lastFailure = error;
        const until = unavailableUntil(error, now());
        nextAvailable = Math.min(nextAvailable, until);
        options.cooldowns?.set(provider.id, until, now());
      }
    }
    if (lastFailure) throw lastFailure;
    throw new ProviderUnavailableError("capacity", { status: 429, ...(Number.isFinite(nextAvailable) ? { resetAtMs: nextAvailable } : {}) });
  });
}
