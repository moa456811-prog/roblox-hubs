# Independent production teaching stage

This set contains **48 training, eight validation and four development examples**, independently authored from the eight frozen production tests. All 60 answers implement Auto Farm, Auto Boss, Quest Farm and Auto Loot through the admitted Blox Fruits factory, plus Walk Speed, Jump Power, Rejoin, Theme and UI lifecycle. UI styles, titles, unnamed cases and tab/control groupings vary; grouping families are disjoint across teaching splits. No disabled substitute or invented remote is taught.

The builder captures `generateCompleteScript`'s actual writer messages and the real provider JSON formatter using an inert transport, then appends the authored assistant composition. It validates schema, complete coverage, game bindings, English and static safety, and executes every reference in the closed parameterized runtime. All 60 references passed. This is reference validation, **not model inference**.

```powershell
node --experimental-strip-types experiments/specialist-v2/production/train/build-train.ts
node --experimental-strip-types --test experiments/specialist-v2/production/train/build-train.test.ts
python experiments/specialist-v2/production/train/audit_prompts.py
```

Files are `artifacts/train.jsonl`, `validation.jsonl`, `dev.jsonl`, plus SHA manifests. Rows retain `messages=[system,user,assistant]`, `expected`, split/family metadata and provenance. Train only on `train`; remove assistant references before generating from the four development inputs. Frozen test data is read after authorship solely for a negative exact prompt/answer overlap audit: zero overlaps. Never train on final test outputs or failures.

The cached, pinned Qwen 7B tokenizer measured:

| Split | Rows | Maximum prompt tokens | Maximum complete training tokens |
|---|---:|---:|---:|
| Train | 48 | 5,749 | 6,542 |
| Validation | 8 | 5,745 | 6,541 |
| Development | 4 | 5,729 | 6,489 |
| Frozen production tests | 8 | 6,289 | — |

System, English policy, complete four-action library, schema, provider JSON reminder and all twelve source hashes are identical across these sets. The longer test prompts contain more verbose planner inventories (+361 mean tokens), original UI/request wording (+156) and evidence text (+33). No production stage or gameplay action is omitted. Details are in `artifacts/prompt-distribution-audit.json`; no row exceeds the 8,192-token training budget.

Resume experiments can mix these 48 training rows with independently admitted v2 training examples, using assistant-only loss and no truncation. Validate loss and development generations before untouched final evaluation. This teaches production prompt formatting and existing controller reuse; it establishes neither support for other games nor live server compatibility. It supplies no hosted inference endpoint and changes no production routing or deployment.
