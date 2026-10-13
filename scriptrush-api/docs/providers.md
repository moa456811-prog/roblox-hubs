# Model providers and quota failover

Reviewed on 2026-10-13. This document distinguishes the production configuration from the reusable routing code. Having an adapter or an API-compatible endpoint does not activate a provider.

## Production configuration

ScriptRush uses APInex when `APINEX_API_KEY` is configured. The existing OpenRouter route is selected only when APInex is unconfigured and `OPENROUTER_API_KEY` is available. OpenRouter has not been activated as an automatic quota fallback for an APInex-configured deployment.

Kaggle is **not activated for public ScriptRush generations**. The supplied Kaggle credential has not been used, stored in a repository file, or added to a deployment environment. No Kaggle account, quota, model-proxy exchange, or inference request was made during this verification. No new provider, paid route, or alternate credential is activated automatically.

Credentials belong only in server-side secret storage after the provider and intended use have been approved. Each configured credential remains bound to its own authorized provider origin; redirects must not forward it elsewhere. Provider credentials must never be placed in browser code, generated scripts, prompts, logs, fixtures, or this document.

## Prepared routing behavior

The reusable provider-chain primitive is prepared for explicitly configured and authorized providers. It does not populate the production chain from arbitrary environment variables or enable Kaggle by itself.

- At most four distinct provider IDs are considered, with one operation attempt per provider in a chain invocation. Duplicate IDs do not multiply attempts.
- A switch repeats the same generation stage with its existing input. It does not restart completed planning or review stages, combine partial outputs, lower the requested output budget, or relax the acceptance checks.
- All attempts share the original deadline and caller cancellation. Exhausting the deadline stops the chain; cancelling the request prevents later provider attempts.
- An adapter must explicitly classify a failure as unavailable. HTTP 402/429 quota or capacity failures can permit a switch. Classified transient upstream, network, or timeout failures can also permit a switch while time remains. Arbitrary error text is insufficient.
- Invalid requests, invalid credentials or access denial (including HTTP 400, 401, and 403), malformed responses, and incomplete output do **not** trigger an automatic switch to another provider. Failed output validation still fails the generation.
- Cooldowns are best-effort memory for one running process. They use a supplied reset time or `Retry-After` when available, with bounded defaults and a maximum of 24 hours. They are not a global account-quota ledger and are not shared reliably between Vercel instances or restarts.
- The existing single-provider minute-limit recovery is retained: a non-daily HTTP 429 with an explicit `Retry-After` of at most 60 seconds may resume that stage once if the original deadline permits. Daily/monthly limits, missing reset headers, and a chain with alternatives do not cause this same-provider wait/retry. Both actual requests are counted.

These guarantees describe the routing primitive, not an assertion that two production providers are currently enabled. Integration must retain the existing provider response validation and generation acceptance checks.

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

Before any future activation, verify permission for the intended workload, discover the models authorized for that credential, bind secrets to the correct endpoint, and test quota/cancellation behavior without forwarding real visitor requests. An actual authorized second provider must be configured before automatic cross-provider failover can operate.
