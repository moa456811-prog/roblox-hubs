import { sanitizeScanner } from "../../../lib/scanner-safety";

export const dynamic = "force-dynamic";

// This frontend serves only the existing, read-only scanner service.
export async function GET(request: Request) {
  try {
    const response = await fetch("https://scriptrush-live-scanner.vercel.app/api/scanner", {
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return Response.json({ error: "The live scanner is unavailable. Try again shortly." }, { status: 502 });
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("script" in data) || typeof data.script !== "string") {
      return Response.json({ error: "The scanner service returned an invalid response." }, { status: 502 });
    }
    return Response.json({ ...data, script: sanitizeScanner(data.script), privacy: "client-visible-filtered-v1" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "The live scanner is unavailable. Try again shortly." }, { status: 502 });
  }
}
