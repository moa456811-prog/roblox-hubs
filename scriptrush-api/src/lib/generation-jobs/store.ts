import { randomUUID } from "node:crypto";
import { link, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { GenerationJob, GenerationJobStore } from "./types.ts";

export function validJobId(id: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id); }
function assertId(id: string) { if (!validJobId(id)) throw new Error("JOB_NOT_FOUND"); }
function copy(job: GenerationJob): GenerationJob { return structuredClone(job); }
const MAX_DOCUMENT_BYTES = 8_000_000;
function encode(job: GenerationJob) { const value = JSON.stringify(job); if (Buffer.byteLength(value) > MAX_DOCUMENT_BYTES) throw new Error("JOB_STORAGE_LIMIT"); return value; }

/** Development/demo only. Real routes never silently select this volatile store. */
export class MemoryGenerationStore implements GenerationJobStore {
  private jobs = new Map<string, GenerationJob>();
  async create(job: GenerationJob) { assertId(job.id); encode(job); if (job.revision !== 0) throw new Error("INVALID_CAS_REVISION"); if (this.jobs.has(job.id)) return false; this.jobs.set(job.id, copy(job)); return true; }
  async get(id: string) { assertId(id); const job = this.jobs.get(id); return job ? copy(job) : null; }
  async compareAndSwap(id: string, revision: number, next: GenerationJob) { assertId(id); const previous = this.jobs.get(id); if (!previous || previous.revision !== revision) return false; if (next.id !== id || next.revision !== revision + 1) throw new Error("INVALID_CAS_REVISION"); encode(next); this.jobs.set(id, copy(next)); return true; }
}

/** Immutable revision files + exclusive hard-link commit are CAS across processes.
 * No stale lock cleanup can race a writer; an interrupted temporary file is ignored.
 * The configured directory must be a persistent, private local volume supporting hard links.
 */
export class FileGenerationStore implements GenerationJobStore {
  readonly directory: string;
  constructor(directory: string) { if (!isAbsolute(directory)) throw new Error("GENERATION_DIRECTORY_MUST_BE_ABSOLUTE"); this.directory = resolve(directory); }
  private path(id: string) { assertId(id); return join(this.directory, id); }
  private async commit(job: GenerationJob): Promise<boolean> {
    const directory = this.path(job.id); await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `pending-${randomUUID()}.tmp`), destination = join(directory, `${job.revision}.json`);
    await writeFile(temporary, encode(job), { flag: "wx", mode: 0o600, flush: true });
    try { await link(temporary, destination); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
    finally { await unlink(temporary).catch(() => undefined); }
  }
  async create(job: GenerationJob) { if (job.revision !== 0) throw new Error("INVALID_CAS_REVISION"); return this.commit(job); }
  async get(id: string): Promise<GenerationJob | null> {
    let names: string[]; try { names = await readdir(this.path(id)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const revisions = names.filter(name => /^(?:0|[1-9][0-9]*)\.json$/.test(name)).map(name => Number(name.slice(0, -5))).sort((a, b) => b - a);
    if (!revisions.length) return null;
    const raw = await readFile(join(this.path(id), `${revisions[0]}.json`));
    if (raw.byteLength > MAX_DOCUMENT_BYTES) throw new Error("JOB_STORAGE_LIMIT");
    const job = JSON.parse(raw.toString("utf8")) as GenerationJob;
    if (job.id !== id || job.revision !== revisions[0] || job.formatVersion !== 1) throw new Error("JOB_STORAGE_CORRUPT");
    return job;
  }
  async compareAndSwap(id: string, revision: number, next: GenerationJob) {
    if (next.id !== id || next.revision !== revision + 1) throw new Error("INVALID_CAS_REVISION");
    const previous = await this.get(id); if (!previous || previous.revision !== revision) return false;
    return this.commit(next);
  }
}

/** Service credential stays server-side. RLS blocks anon/authenticated direct access. */
export class SupabaseGenerationStore implements GenerationJobStore {
  private endpoint: string;
  private key: string;
  private fetcher: typeof fetch;
  constructor(url: string, key: string, fetcher: typeof fetch = fetch) {
    const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error("INVALID_GENERATION_SUPABASE_URL");
    if (!key || key.length < 20) throw new Error("GENERATION_SUPABASE_KEY_REQUIRED");
    this.endpoint = `${parsed.origin}/rest/v1/scriptrush_generation_jobs`; this.key = key; this.fetcher = fetcher;
  }
  private async request(method: string, query: URLSearchParams, body?: unknown) {
    const response = await this.fetcher(`${this.endpoint}?${query}`, { method, redirect: "error", signal: AbortSignal.timeout(10000), headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", Prefer: "return=representation" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.status === 409 && method === "POST") return null;
    if (!response.ok) throw new Error("GENERATION_STORE_UNAVAILABLE");
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) { try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > MAX_DOCUMENT_BYTES + 10000) { await reader.cancel(); throw new Error("JOB_STORAGE_LIMIT"); } chunks.push(part.value); } } finally { reader.releaseLock(); } }
    const text = Buffer.concat(chunks).toString("utf8");
    const rows: unknown = text ? JSON.parse(text) : []; if (!Array.isArray(rows)) throw new Error("GENERATION_STORE_INVALID_RESPONSE"); return rows as Array<{ document: GenerationJob }>;
  }
  async create(job: GenerationJob) { assertId(job.id); encode(job); if (job.revision !== 0) throw new Error("INVALID_CAS_REVISION"); const rows = await this.request("POST", new URLSearchParams(), { id: job.id, revision: 0, document: job }); return Boolean(rows?.length); }
  async get(id: string) { assertId(id); const rows = await this.request("GET", new URLSearchParams({ id: `eq.${id}`, select: "document", limit: "1" })); const job = rows?.[0]?.document ?? null; if (job && (job.id !== id || job.formatVersion !== 1)) throw new Error("JOB_STORAGE_CORRUPT"); return job; }
  async compareAndSwap(id: string, revision: number, next: GenerationJob) { assertId(id); if (next.id !== id || next.revision !== revision + 1) throw new Error("INVALID_CAS_REVISION"); encode(next); const rows = await this.request("PATCH", new URLSearchParams({ id: `eq.${id}`, revision: `eq.${revision}`, select: "document" }), { revision: next.revision, document: next }); return rows?.length === 1; }
}

export function configuredGenerationStore(env: Record<string, string | undefined> = process.env): GenerationJobStore {
  if (env.SCRIPTRUSH_GENERATION_STORE === "supabase") {
    if (!env.SCRIPTRUSH_GENERATION_SUPABASE_URL || !env.SCRIPTRUSH_GENERATION_SUPABASE_SERVICE_KEY) throw new Error("DURABLE_GENERATION_STORE_REQUIRED");
    return new SupabaseGenerationStore(env.SCRIPTRUSH_GENERATION_SUPABASE_URL, env.SCRIPTRUSH_GENERATION_SUPABASE_SERVICE_KEY);
  }
  if (env.SCRIPTRUSH_GENERATION_STORE === "filesystem" && env.SCRIPTRUSH_GENERATION_DIRECTORY && !env.VERCEL) return new FileGenerationStore(env.SCRIPTRUSH_GENERATION_DIRECTORY);
  throw new Error("DURABLE_GENERATION_STORE_REQUIRED");
}
