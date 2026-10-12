import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ ok: true, app: "ScriptRush", mode: "validated-single-script", authRequired: false, quotaEnabled: false, provider: process.env.APINEX_API_KEY ? "apinex/free" : "openrouter/free", automaticRetry: true, deterministicFallback: false, functionTimeoutSeconds: 300 }); }
