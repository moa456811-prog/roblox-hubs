# ScriptRush specialist v2 dataset

This is an original, deterministic offline teaching set for the existing
`window/pages` composition format. It fixes the v1 prompt's abstract-only format
teaching and duplicated UI instructions. It does not train on scraped scripts,
private conversations, user credentials, model guesses or prior test outputs.

The shared SYSTEM contains a genuinely populated six-control composition as a
format example. It is the same for the base and adapted models and contains no
fixture game name, test identifier or held-out answer. Every user message has:

- `request`: a short French or English Full Hub request.
- `requestedUi`: exact dimensions, palettes, typography, navigation and naming.
- `requestedControls`: explicit visible text, page placement, kind, numeric bounds
  and initial state. It contains no action choice or executable callback.
- `requirements`: independent behaviors and their supported evidence.
- `gameEvidence`: only the needed original fictional game objects and attributes.

Answers are complete JSON compositions, with every feature bound to an independent
working control. The 11 learned operations are walk speed, jump power, camera FOV,
night vision, local landmark highlighting, camera focus, reading an evidenced
player currency attribute, opening an evidenced journal, HUD visibility, rejoin
and applied palette switching. Custom callbacks perform local effects, use bounded
lookups and register persistent-effect cleanup. There are no invented remotes,
external loaders, print-only buttons or disabled supported controls.

| Split | Rows | Purpose |
| --- | ---: | --- |
| train | 256 | Fit weights on assistant targets. |
| validation | 24 | Loss diagnostics / checkpoint selection, no optimizer batches. |
| dev | 24 | Debug generation and choose experiments, never train on its answers. |
| test | 24 | Final blind acceptance, never upload its answers or tune on its results. |

Each split is exactly half French / half English requests and half unnamed / half
custom named hubs. Every action family sees all four language/naming combinations.
All functional UI is English; custom titles, including quoted titles, stay exact.
Training covers eight distinct layout and action families. Other splits each use
three separate layout and action families, fresh fictional object/attribute names,
and different actual action combinations. V2 final cases also differ from v1 test
designs, game-specific paths and combinations. Each target has 6–11 controls on
3–5 nonempty pages. The fixed six-control SYSTEM example is not one of the targets.

From `scriptrush-api`:

```powershell
node --experimental-strip-types --test experiments/specialist-v2/dataset/build-dataset.test.ts
node --experimental-strip-types experiments/specialist-v2/dataset/build-dataset.ts
```

Generated JSONL and the SHA256 manifest go into the ignored
`test-results/specialist-v2/dataset/` directory. The guard validates every target
against the actual Zod schema, requirement coverage, renderer, English UI check,
static source safety review and supplied paths. It rejects duplicate prompts or
answers, split leakage, hidden differences between requested control values and
targets, empty pages and missing behaviors.

Measured locally with the official `Qwen/Qwen2.5-Coder-7B-Instruct` tokenizer JSON,
using Qwen's complete three-message `<|im_start|>role\n...<|im_end|>\n` format:

| Split | Median full tokens | Maximum full tokens | Maximum answer tokens |
| --- | ---: | ---: | ---: |
| train | 3,539 | 4,337 | 1,421 |
| validation | 3,574 | 3,972 | 1,273 |
| dev | 3,908 | 4,082 | 1,298 |
| test | 3,805 | 4,185 | 1,361 |

No example exceeds 4,608 tokens under that measurement. Training must still
recheck its loaded tokenizer/chat template and reject overlong complete examples;
never truncate an assistant target. The builder's portable character/4 values are
explicitly rough estimates, not these actual tokenizer measurements.

These are synthetic client-local acceptance fixtures, not evidence that arbitrary
live-game server functionality works. Static acceptance is necessary but must be
supplemented by the separate runtime harness executing generated controls.
