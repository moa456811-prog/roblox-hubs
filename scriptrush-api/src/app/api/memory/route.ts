import { NextResponse } from "next/server";
export const maxDuration = 30;
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SCRIPTRUSH_MEMORY_SECRET;
  if (!url || !secret) return NextResponse.json({ error: "Memory backend unavailable" }, { status: 503 });
  try {
    const body = await request.text();
    const response = await fetch(`${url}/functions/v1/scriptrush-memory`, { method: "POST", headers: { "Content-Type": "application/json", "x-scriptrush-secret": secret }, body, cache: "no-store" });
    const text = await response.text();
    return new NextResponse(text, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Memory operation failed" }, { status: 502 });
  }
}
