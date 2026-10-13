import assert from "node:assert/strict";
import test from "node:test";
import { GenerationJobService } from "../src/lib/generation-jobs/service.ts";
import { MemoryGenerationStore, SupabaseGenerationStore } from "../src/lib/generation-jobs/store.ts";
import type { GenerationJob, GenerationStageHandlers } from "../src/lib/generation-jobs/types.ts";
const never = async () => { throw new Error("NOT_EXPECTED"); };
const handlers: GenerationStageHandlers = { discover: never, retrieve: never, plan: never, generate: never, validate: never };
const input = { request: "Make a UI", role: "project_client", allowModelProcessing: false };

test("Supabase REST driver binds CAS to id+revision and persists private capability hash across restart", async () => {
  const memory = new MemoryGenerationStore(), created = await new GenerationJobService(memory, handlers).create(input), job = (await memory.get(created.jobId))!;
  let row: { id: string; revision: number; document: GenerationJob } | undefined;
  const requests: Array<{ url: URL; method: string; headers: Headers }> = [];
  const fetcher: typeof fetch = async (url, options) => {
    const parsed = new URL(String(url)), method = options?.method || "GET", headers = new Headers(options?.headers); requests.push({ url: parsed, method, headers });
    assert.equal(parsed.origin, "https://project.supabase.co"); assert.equal(options?.redirect, "error"); assert.equal(headers.get("authorization"), "Bearer server-only-key-example");
    if (method === "POST") { if (row) return Response.json({ code: "23505" }, { status: 409 }); row = JSON.parse(String(options?.body)); return Response.json([row]); }
    if (method === "GET") return Response.json(row?.id === parsed.searchParams.get("id")?.slice(3) ? [{ document: row!.document }] : []);
    if (method === "PATCH") { const match = row && parsed.searchParams.get("id") === `eq.${row.id}` && parsed.searchParams.get("revision") === `eq.${row.revision}`; if (!match) return Response.json([]); row = { ...row!, ...JSON.parse(String(options?.body)) }; return Response.json([{ document: row!.document }]); }
    throw new Error("UNEXPECTED_METHOD");
  };
  const store = new SupabaseGenerationStore("https://project.supabase.co", "server-only-key-example", fetcher); assert.equal(await store.create(job), true); assert.equal(await store.create(job), false);
  const updated = { ...job, revision: 1, model: "changed" }; const outcomes = await Promise.all([store.compareAndSwap(job.id, 0, updated), store.compareAndSwap(job.id, 0, updated)]); assert.equal(outcomes.filter(Boolean).length, 1);
  const restarted = new SupabaseGenerationStore("https://project.supabase.co", "server-only-key-example", fetcher); assert.equal((await restarted.get(job.id))?.capabilityHash, job.capabilityHash); assert.equal((await restarted.get(job.id))?.revision, 1);
  assert.ok(requests.filter(item => item.method === "PATCH").every(item => item.url.searchParams.has("revision")));
});
test("Supabase failures sanitize credential-bearing remote bodies and disallow unsafe URL", async () => {
  assert.throws(() => new SupabaseGenerationStore("http://project.supabase.co", "server-only-key-example"), /INVALID_GENERATION_SUPABASE_URL/);
  const store = new SupabaseGenerationStore("https://project.supabase.co", "server-only-key-example", async () => new Response("database server-only-secret", { status: 503 }));
  await assert.rejects(store.get("00000000-0000-4000-8000-000000000000"), { message: "GENERATION_STORE_UNAVAILABLE" });
});
test("SQL preparation enables RLS and denies direct public table access, not applied by tests", async () => {
  const { readFile } = await import("node:fs/promises"); const sql = await readFile(new URL("../src/lib/generation-jobs/prepare-supabase.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/); assert.match(sql, /force row level security/); assert.match(sql, /revoke all.*from public, anon, authenticated/); assert.match(sql, /grant select, insert, update.*to service_role/); assert.doesNotMatch(sql, /security definer|to authenticated\s+using\s*\(true\)/i);
});
