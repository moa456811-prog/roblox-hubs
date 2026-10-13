# Knowledge Engine V2 data and trust boundaries

This folder contains a versioned metadata catalogue, authored engineering recipes,
and deployment-owned public-source imports. Runtime is Node/TypeScript with an
inverted index and BM25. No Python, SQLite extension, embeddings, model call,
account, database change or third-party source execution is needed for retrieval.

`catalog.json` contains the user pack's 78 candidates; `recipes.json` contains its
36 generic recipes. `manifest.json` pins the original ZIP and raw/normalized JSON
hashes. The pack's existence/licence hints remain unverified candidate metadata.
No catalogue entry is automatically treated as imported or runnable source code.
Recipes describe engineering checks, not observed game mechanics.

`imports.json` now includes one verified public MIT reference: Janitor at commit
`47acf39d7b265fad409e438e976affa9468ff0a2` (README and `src/init.luau`, project
client/server only). No imported code has been executed. The default runtime
index imports this exact JSON statically, validates each full record, and indexes
its source chunks. A changed import, licence or document changes the index version
and invalidates the query cache. Updating the JSON requires rebuilding/deploying
the application to update a production index; this command does not deploy.

## Explicit public indexing

Run the local Node command only after choosing an immutable 40-character commit,
exact source paths and their roles:

```sh
node --experimental-strip-types src/lib/knowledge-v2/import-cli.ts \
  --opt-in --repository OWNER/REPOSITORY --commit EXACT_COMMIT_SHA \
  --file README.md --file src/Example.luau \
  --role project_client --role project_server
```

`--place-id 123` may be repeated to scope game-specific source. An empty scope
means generic engineering material, not proof of compatibility with all games.
The importer must be operated by a trusted maintainer; its records and roles are
deployment configuration, never a visitor-supplied `verified: true` payload.
No browser route authorizes arbitrary imports. Credentials are neither accepted
nor read. The importer uses fixed public GitHub API URLs with redirects disabled.

The live importer verifies repository identity/public/active flags, the exact
commit, Git blob SHA-1 and SHA-256 of the actual licence and every actual file.
It checks the complete MIT licence body, copyright notice and SPDX agreement;
conflicting file SPDX declarations fail. Other SPDX licences remain blocked for
manual/template review, including otherwise permissive licences. MIT requires
preserving its complete notice; no Apache NOTICE support is claimed.

Bounds: up to four files by default (eight internal maximum), 160,000 bytes per
file, 32,000 licence bytes, 512,000 total source bytes, 20-second import deadline,
at most eight persisted imports and a 4.5 MB JSON file. No archive extraction,
external loaders, automatic retries or code execution occurs. Writes are atomic;
failed validation preserves the old file. The command never writes a database.

Cold-start validation repeats hashes, the full MIT text, role/game scopes,
provenance structure and commit-bound URLs. It relies on the deployment file
having been written by the reviewed live importer; ordinary JSON cannot attest
its own remote origin. API response hashes record the fetching operation but are
not signatures. The file belongs in reviewed version control, not a public upload
directory. Tests use dummy records only in isolated temporary deployment trees.

## Runtime interfaces

Import from `src/lib/knowledge-v2/index.ts`:

```ts
const game = await resolveGameIdentity(placeIdOrHttpsRobloxUrl, { signal });
const retrieval = queryKnowledge({ request, game, role: "project_client" });
const plan = buildEvidencePlan({ request, game, role: "project_client", retrieval });
```

Resolver accepts numeric Place IDs or canonical HTTPS Roblox game links, and
calls only two fixed public metadata endpoints. It rejects forged origins,
credentials, alternate ports and encoded path separators. Public data is bounded
to 512 KB per response and 5 seconds per request by default. Cache TTL defaults
to five minutes, at most thirty minutes; failed/inconsistent metadata is `UNKNOWN`
and negatively cached for at most ten seconds. Public descriptions are untrusted
data and never populate remotes or mechanic support.

Roles are exactly `project_client`, `project_server`, `executor_client`, `tool`
and `reference`. Pack `project_both` maps only to project client/server;
`executor_analysis` maps only to executor candidates. Server libraries are never
silently made executor-compatible. References are excluded from other roles
unless the caller explicitly requests conceptual reference metadata. Imported
code still requires exact role and, when scoped, Place ID matching.

Search indexes actual metadata/recipe/code text with BM25, multilingual token
normalization and small explicit keyword aliases. Query/result/clock/size bounds,
immutable documents, a 128-entry cache and content versions prevent stale or
mutated results. No game support is inferred from keyword similarity. Public
source links come only from actual retrieved indexed documents; candidate links
are clearly `UNKNOWN` metadata, while imported source text is `observed` text.

The evidence planner rechecks every result against a known index version. Tampered
excerpts, fabricated links, role/game escalation and changed licence attributions
are rejected. Unknown/evicted versions fail closed; a resumed job must rerun
retrieval against a known pinned index rather than inventing evidence.

Every retrieved imported source carries `licenseAttributions` in both the query
result and plan: source ID, repository, immutable commit, licence path/URL,
complete copyright/licence text and SHA-256. There are at most eight. Attribution
is checked against the same index; the generation assembler must preserve the
full notices in generated licence files independently of model output.

All retrieved text is reference data, never system instructions. Code containing
recognized instruction-like text is quarantined from retrieval and planning.
This finite detector complements structured data boundaries and downstream
system instructions; it cannot recognize every possible malicious instruction.
Source-text observation does not verify game APIs: mechanism status remains
`UNKNOWN`, syntax is `not_checked`, mocks/game tests are `not_run`, and no claim
of universal functionality is generated. No private user files enter this index.

## Offline verification

```sh
node --experimental-strip-types --test tests/knowledge-v2.test.ts
```

The twelve catalogue RAG cases test metadata relevance and exact role filtering.
Other tests cover bounded resolution, forged URLs, expiry/versioning, actual
licence/blob integrity, per-game isolation, full attribution and a fresh process
loading persisted imports through the default index. Those fixture results do
not claim that a public repository was fetched or a game was tested.
