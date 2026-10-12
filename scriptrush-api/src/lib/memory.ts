import "server-only";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SCRIPTRUSH_MEMORY_SECRET;

export async function memoryOp<T = any>(body: Record<string, unknown>): Promise<T | null> {
  if (!BASE || !SECRET) return null;
  try {
    const response = await fetch(`${BASE}/functions/v1/scriptrush-memory`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-scriptrush-secret": SECRET,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
