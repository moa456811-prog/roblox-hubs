# Model providers and quota failover

Reviewed on 2026-10-13. This document describes the authorized configuration and routing behavior. Deployment and live-model verification must be recorded separately; a configured key or an API-compatible endpoint alone does not prove availability.

## Production configuration

The user authorized an alternative free API and automatic switching with APInex. With both `APINEX_API_KEY` and `OPENROUTER_API_KEY` configured, ScriptRush prioritizes APInex's `free/gpt-6-luna` and uses OpenRouter's `apodex/apodex-1.1-mini:free` when the current stage encounters a classified quota/capacity or transient provider failure. A single configured key yields a single-provider chain. An APInex cooldown allows OpenRouter to serve subsequent stages; APInex regains priority after the cooldown expires.

OpenRouter requests are pinned to `provider.only: ["novita"]`, `provider.require_parameters: true`, `provider.allow_fallbacks: false`, and `provider.max_price: { prompt: 0, completion: 0 }`. The model ID itself is the explicit free catalog entry. These restrictions prevent a paid model or a different upstream host from being silently selected. The API origin remains `https://openrouter.ai/api/v1/chat/completions`.

The existing OpenRouter key is stored as a Sensitive variable in the Vercel Production environment; no new key or signup is required for this configuration. Its live validity and account-specific remaining quota have not yet been established by this documentation update.

Kaggle is **not activated for public ScriptRush generations**. The supplied Kaggle credential has not been used, stored in a repository file, or added to a deployment environment. No Kaggle account, quota, model-proxy exchange, or inference request was made during its verification. No paid route or arbitrary alternate credential is activated automatically.

Credentials belong only in server-side secret storage after the provider and intended use have been approved. Each configured credential remains bound to its own authorized provider origin; redirects must not forward it elsewhere. Provider credentials must never be placed in browser code, generated scripts, prompts, logs, fixtures, or this document.

## Routing behavior

The provider-chain primitive is integrated for the two explicitly configured and authorized providers above. It does not populate the chain from arbitrary endpoints or enable Kaggle by itself.

- At most four distinct provider IDs are considered, with one operation attempt per provider in a chain invocation. Duplicate IDs do not multiply attempts.
- A switch repeats the same generation stage with its existing input. It does not restart completed planning or review stages, combine partial outputs, lower the requested output budget, or relax the acceptance checks.
- All attempts share the original deadline and caller cancellation. Exhausting the deadline stops the chain; cancelling the request prevents later provider attempts.
- An adapter must explicitly classify a failure as unavailable. HTTP 402/429 quota or capacity failures can permit a switch. Classified transient upstream, network, or timeout failures can also permit a switch while time remains. Arbitrary error text is insufficient.
- Invalid requests, invalid credentials or access denial (including HTTP 400, 401, and 403), malformed responses, and incomplete output do **not** trigger an automatic switch to another provider. Failed output validation still fails the generation.
- Cooldowns are best-effort memory for one running process. They use a supplied reset time or `Retry-After` when available, with bounded defaults and a maximum of 24 hours. They are not a global account-quota ledger and are not shared reliably between Vercel instances or restarts.
- If both configured routes are limited or unavailable, the stage fails with a structured error. It does not loop indefinitely, replay completed stages, or present a partial result as success.
- The existing single-provider minute-limit recovery is retained: a non-daily HTTP 429 with an explicit `Retry-After` of at most 60 seconds may resume that stage once if the original deadline permits. Daily/monthly limits, missing reset headers, and a chain with alternatives do not cause this same-provider wait/retry. Both actual requests are counted.

Both providers use portable `json_object` mode for planning, composition and review. The real Novita endpoint rejected the generated strict JSON schema with HTTP 400 despite catalog support; its documented schema subset is narrower than the application's full Zod schemas. The complete Zod constraints, feature coverage, UI checks and source-evidence validation remain authoritative on the server. A format error stops the stage rather than triggering another provider request. Diagnostics contain only fixed boolean categories, never upstream error text or request content.

The existing provider-response validation and generation acceptance checks still apply after a switch. Actual transport requests, including failed attempts, are counted; a cooldown rejection before a request counts as zero transport attempts. Character counts remain diagnostic estimates rather than provider token or billing measurements.

## OpenRouter model selection

The public [OpenRouter catalog](https://openrouter.ai/api/v1/models) and the [model endpoints](https://openrouter.ai/api/v1/models/apodex/apodex-1.1-mini:free/endpoints), checked on 2026-10-13 without an inference request, list `apodex/apodex-1.1-mini:free` with a 262,144-token context, a 235,929-token maximum completion budget, zero prompt/completion prices, and JSON-schema response support. The selected live endpoint is `novita/bf16`, with status `0` in that catalog snapshot. These values are discovery facts, not a generation-quality or uptime guarantee; free model catalogs can change.

[Apodex 1.1 Mini](https://openrouter.ai/apodex/apodex-1.1-mini:free) is a reasoning-first model for sustained tasks involving code, data, and tools. Its [official model release](https://huggingface.co/apodex/Apodex-1.1-mini) uses Apache 2.0. [OpenRouter's terms, section 5](https://openrouter.ai/terms), expressly contemplate models incorporated into customer-facing products and services. [Novita's terms](https://novita.ai/legal/terms-of-service) govern the selected host; no trial-only production prohibition was identified for that route.

OpenRouter's [official free-tier guide](https://openrouter.ai/blog/tutorials/any-coding-agent/) states 20 requests per minute and 50 per day without purchased credits, rising to 1,000 per day after an all-time purchase of $10. This project does not purchase credits or enable paid fallback. Failed attempts can consume the shared daily allowance, and upstream capacity can impose additional limits. The exact allowance and remaining quota for the configured account require an authenticated read of its [key limits](https://openrouter.ai/docs/api/reference/limits); they must not be inferred from these general ceilings.

The NVIDIA Nemotron 3 Super free trial endpoint was considered but excluded: its [OpenRouter provider page](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b:free/providers) links [NVIDIA API Trial Terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf), sections 1.2 and 1.4 of which restrict production use. A commercially permissive model-weights license does not remove a hosted trial API's restrictions.

## Kaggle verification

Kaggle's active [Terms of Use, effective June 22, 2025](https://www.kaggle.com/terms), restrict its Services to the account holder's internal, personal, non-commercial use and exclude use on behalf of or for the benefit of third parties. Serving requests from public ScriptRush visitors falls outside those standard conditions, even if visitors are not charged. No public Benchmarks exception permitting this use was found. A separate written authorization from Kaggle would be needed before enabling that production route.

Kaggle Benchmarks is documented for model evaluation. A first-party, personal, non-commercial benchmark comparing Luau generation and validation can be considered within the applicable terms; it is not a way to relay public visitor requests through a benchmark. No benchmark or inference has been launched here.

The technical API exists, but its authentication and limits differ from a permanent production API key:

- A `KGAT` credential authenticates the Kaggle account API. It is not the temporary Model Proxy inference credential. The official CLI exchanges account authentication for a proxy URL, proxy key, and expiry through `kaggle benchmarks auth` or `init`.
- The pinned SDK describes the default local proxy token as having a **two-hour TTL**, requiring Persona and phone verification, limiting access to the `kaggle-benchmarks-local` model group, and allowing a single active token per user. Any implementation must use the returned expiry as authoritative rather than assume that a cached key remains usable.
- `LLMS_AVAILABLE` is the curated subset authorized for local development and testing. It is not the full benchmark catalog. The full catalog is exposed through scheduled benchmark tasks running on Kaggle; a model visible there is not necessarily available to a local token.
- Inference quota has separate daily and monthly refill periods. The claimed **$10 daily allowance has not been verified for this account**, and a daily allowance does not establish the monthly total or remove model/access restrictions. Kaggle GPU/TPU notebook-hour quota is a different resource.
- Kaggle's official Harbor example demonstrates OpenAI-compatible chat-completions and responses endpoints, plus an Anthropic-compatible messages endpoint, for local benchmark agents. Protocol compatibility does not grant permission to use the service for public application traffic. Do not copy an old staging hostname into production configuration.

Official technical references, pinned to the versions reviewed:

- [Kaggle CLI Benchmarks commands and local-model restrictions](https://github.com/Kaggle/kaggle-cli/blob/9c57dd74c29904c40ff7879eed33644be89d2e2f/docs/benchmarks.md).
- [Kaggle SDK Model Proxy service: quota periods and default local-token restrictions](https://github.com/Kaggle/kaggle-sdk-python/blob/f983c97287bf274ebab506aac85eda6efebe3b32/kagglesdk/models/services/model_proxy_api_service.py).
- [Kaggle Harbor template: benchmark-agent authentication and compatible endpoints](https://github.com/Kaggle/kaggle-benchmark-harbor-starter-template/blob/b8447fd63570908771572fbc35597e2923e6b98c/README.md).

Before any future Kaggle activation, verify permission for the intended workload, discover the models authorized for that credential, bind secrets to the correct endpoint, and test quota/cancellation behavior without forwarding real visitor requests. Kaggle is not part of the current APInex/OpenRouter chain.
