# Original specialist dataset

Run from `scriptrush-api`:

```powershell
node --experimental-strip-types experiments/specialist/build-dataset.ts
node --experimental-strip-types --test experiments/specialist/dataset/build-dataset.test.ts
```

The deterministic builder writes ignored artifacts to `test-results/specialist/dataset/`: 128 training, 16 validation and 24 held-out test JSONL rows plus a SHA256 manifest. Only train and validation may be uploaded for training. Test answers stay local to the evaluator. The notebook must use only each row's `messages` column, never its `expected` metadata or inference outputs.

Every row contains `id`, `split`, `designFamily`, `actionFamily`, three chat `messages` (system/user/assistant) and an `expected` composition/contract/UI object for local evaluation. Inference uses only system and user messages. User content is JSON with a natural-language request, requirement inventory and `gameEvidence`. The target is a complete composition JSON, rendered to Luau using the existing server renderer; no 70k-character Lua target is needed.

Fixtures are original fictional owned games, not scraped scripts. Each Full Hub has 6–8 independent working local controls across 3–5 pages, exact dimensions/colors/fonts, custom or absent titles and English functional UI. Half the requests are French. Controls include current-character movement, camera FOV/focus, local Lighting, an owned Highlight, existing journal/HUD visibility, current player attributes, explicit rejoin and applied theme switching. Their code contains real local effects and cleanup rather than placeholder buttons. Evidence names exact fictional object paths; no server remote, external loader, credential or private conversation is used.

All target compositions pass the project's full schema, feature coverage and renderer. Guards reject duplicate prompts/answers, cross-split design families and cross-split action-combination families. Individual operations intentionally overlap: the test measures combining known primitives with held-out layouts and objects. These checks establish static fixture integrity; they do not claim actual Roblox execution or general real-game improvement. The benchmark must report these limitations and compare the same base model before/after the adapter, on identical held-out prompts.
