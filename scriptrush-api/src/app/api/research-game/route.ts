import { NextResponse } from "next/server";
import { researchGame, publicResearchView } from "@/lib/research";
import { curatedGameKnowledge, mergeResearchKnowledge } from "@/lib/game-adapters/catalog";
export const maxDuration = 60;
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 180);
  if (!query) return NextResponse.json({ profile: null });
  try {
    const profile = await researchGame(query);
    const curated = curatedGameKnowledge(profile);
    return NextResponse.json({ profile: { ...publicResearchView(profile), researchKnowledge: mergeResearchKnowledge(curated?.researchKnowledge, profile.researchKnowledge) } }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ profile: { query, name: query, confidence: "low", featureSignals: [], sourceCounts: { scriptBlox: 0, github: 0 }, publicScripts: [], warnings: ["Deep research was temporarily unavailable."], researchedAt: new Date().toISOString() } });
  }
}
