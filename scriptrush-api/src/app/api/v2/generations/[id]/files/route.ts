import { handleGenerationHttp } from "@/lib/generation-jobs/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleGenerationHttp("files", request, (await context.params).id);
}
