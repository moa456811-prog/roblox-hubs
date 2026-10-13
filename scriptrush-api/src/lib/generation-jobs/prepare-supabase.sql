-- REVIEW ONLY. Not applied to any database. Requires approval and schema advisors.
-- This server-side capability store has no browser-accessible table permissions.
create table if not exists public.scriptrush_generation_jobs (
  id uuid primary key,
  revision bigint not null check (revision >= 0),
  document jsonb not null,
  check (coalesce(document->>'id' = id::text, false)),
  check (coalesce((document->>'revision')::bigint = revision, false)),
  check (coalesce(document->>'formatVersion' = '1', false)),
  check (coalesce(document->>'capabilityHash' ~ '^[0-9a-f]{64}$', false)),
  check (octet_length(document::text) <= 8000000)
);
alter table public.scriptrush_generation_jobs enable row level security;
alter table public.scriptrush_generation_jobs force row level security;
revoke all on public.scriptrush_generation_jobs from public, anon, authenticated;
grant select, insert, update on public.scriptrush_generation_jobs to service_role;
-- No anon/authenticated policy: only the backend service can access rows.
-- Ownership is the SHA256 of a random 256-bit per-job bearer capability.
-- CAS: PATCH ...?id=eq.<uuid>&revision=eq.<expected> updates one row or none.
