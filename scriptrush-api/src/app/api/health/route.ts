import { NextResponse } from "next/server";
export async function GET() {
  const provider = process.env.APINEX_API_KEY?.trim() ? "apinex/free" : process.env.OPENROUTER_API_KEY?.trim() ? "openrouter/free" : "unconfigured";
  return NextResponse.json({ ok: true, app: "ScriptRush", mode: "validated-single-script", authRequired: false, quotaEnabled: false, provider, automaticRetry: true, automaticProviderSwitch: false, providerCooldown: "per-instance", deterministicFallback: false, functionTimeoutSeconds: 300 });
}
