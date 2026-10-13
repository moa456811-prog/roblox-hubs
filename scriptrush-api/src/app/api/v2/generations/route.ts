import { handleGenerationHttp } from "@/lib/generation-jobs/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: Request) {
  return handleGenerationHttp("create", request);
}
