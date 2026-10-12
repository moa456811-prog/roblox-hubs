/** Caller cancellation stops generation; provider timeouts remain retryable. */
export function throwIfCallerAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Generation stopped.", "AbortError");
}

/** The same signal governs the request and its entire streamed response. */
export async function withProviderAbort<T>(timeoutMs: number, callerSignal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  throwIfCallerAborted(callerSignal);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeout.signal]) : timeout.signal;
  try {
    const result = await operation(signal);
    throwIfCallerAborted(callerSignal);
    if (timeout.signal.aborted) throw new Error("AI_TIMEOUT");
    return result;
  } catch (error) {
    // Normalize arbitrary caller abort reasons without exposing them in logs.
    throwIfCallerAborted(callerSignal);
    if (timeout.signal.aborted) throw new Error("AI_TIMEOUT");
    throw error;
  } finally { clearTimeout(timer); }
}

/** Stop capacity and transport backoff immediately when the user stops. */
export async function providerDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfCallerAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const aborted = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      reject(new DOMException("Generation stopped.", "AbortError"));
    };
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
  throwIfCallerAborted(signal);
}
