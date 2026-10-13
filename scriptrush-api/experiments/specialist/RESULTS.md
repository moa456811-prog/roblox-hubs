# ScriptRush private specialist pilot — 2026-10-13

Actual Kaggle GPU training and paired inference, not reference-answer self-tests.
Private run: https://www.kaggle.com/code/sciptrush/scriptrush-private-specialist-pilot

Base: `Qwen/Qwen2.5-Coder-1.5B-Instruct`, revision `2e1fd397ee46e1388853d2af2c993145b0f1098a`. LoRA: 16 optimizer steps,
128 original synthetic training examples, 4,358,144 trainable parameters,
96.2 seconds training on Tesla T4.
Training loss: 0.3650; validation loss on 4 examples: 0.3279.
Training loss is diagnostic, not evidence of improved full hubs.

| Measured result | Base | LoRA specialist |
| --- | ---: | ---: |
| Strict compositions accepted | 0/6 | 0/6 |
| Finished with EOS | 6/6 | 6/6 |
| Valid complete JSON composition | 0/6 | 0/6 |
| Exact UI, on evaluable compositions | Not assessable | Not assessable |
| Audited requirement/control matches, on evaluable requirements | Not assessable | Not assessable |
| Features not assessable because composition is invalid | 54 | 54 |
| Median generation time (seconds) | 53.1 | 80.8 |

## Observed failure diagnosis

- base: 5 syntactically invalid JSON outputs; 0 input-shaped echoes; 0 compositions with no controls.
- specialist: 0 syntactically invalid JSON outputs; 5 input-shaped echoes; 1 compositions with no controls.

No accepted composition means this adapter is rejected for production. Syntactically
valid JSON alone is insufficient: it must contain the requested window and working controls.

All 6 held-out cases request untitled hubs in French, with English UI and eight controls each.
They cover three held-out layout families and three held-out action combinations.
Both variants received identical inputs, greedy decoding, 3,072 output tokens and a 100-second limit.
Expected test answers stayed local. Prompt/answer/design/action-family leakage audit: clean.

Strict control matching includes labels, descriptions, bounds and exact audited callback text.
It conservatively rejects different implementations even when they might be equivalent.
Invalid compositions leave downstream UI/features unassessed; they do not count as successes.
No generated code was executed on the host or in a live Roblox game.
The test does not cover custom names, arbitrary game remotes or APInex/OpenRouter model quality.
Six synthetic cases cannot establish general model superiority or real-game functionality.

The adapter and tokenizer are saved. Base model weights are a separate prerequisite.
The public ScriptRush provider chain remains on its verified release; this experiment does not deploy a replacement.
Machine-readable results, actual predictions and training/adapter hashes are included in the local artifact bundle.
Uploaded script SHA256: `48dc4ecd3e1f55dfe5de1636822f691b50cc5c2113222bfea152152717faa5ed`.
