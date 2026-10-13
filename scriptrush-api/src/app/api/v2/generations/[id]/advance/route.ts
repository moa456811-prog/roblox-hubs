import { handleGenerationHttp } from "@/lib/generation-jobs/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleGenerationHttp("advance", request, (await context.params).id);
}
