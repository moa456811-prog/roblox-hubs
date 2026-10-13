import { NextResponse } from "next/server";
import { describeProviderConfiguration } from "../../../lib/provider-config.ts";

export async function GET() {
  const providers = describeProviderConfiguration({ APINEX_API_KEY: process.env.APINEX_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY });
  return NextResponse.json({ ok: true, app: "ScriptRush", mode: "validated-single-script", authRequired: false, quotaEnabled: false, ...providers, automaticRetry: true, providerCooldown: "per-instance", deterministicFallback: false, functionTimeoutSeconds: 300 });
}
