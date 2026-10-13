"""Package only verified experiment artifacts; never bundle credentials or logs."""
import hashlib
import json
from pathlib import Path
import zipfile

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "test-results" / "specialist"
MODEL = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
REVISION = "2e1fd397ee46e1388853d2af2c993145b0f1098a"


def main():
    summaries = list((WORK / "kaggle-output").rglob("training-summary.json"))
    if len(summaries) != 1:
        raise ValueError("Exactly one completed training artifact is required")
    artifact = summaries[0].parent
    training = json.loads(summaries[0].read_text(encoding="utf-8"))
    receipt = json.loads((WORK / "submission-manifest.json").read_text(encoding="utf-8"))
    report = json.loads((WORK / "report.json").read_text(encoding="utf-8"))
    metadata = json.loads((WORK / "kaggle-run" / "kernel-metadata.json").read_text(encoding="utf-8"))
    predictions = [json.loads(line) for line in (artifact / "predictions.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    expected_pairs = {(case, variant) for case in receipt["testIds"] for variant in ("base", "specialist")}
    if len(predictions) != len(expected_pairs) or {(row["id"], row["variant"]) for row in predictions} != expected_pairs:
        raise ValueError("Complete paired inference is required")
    if training["model"] != MODEL or training["revision"] != REVISION or training["blindTestIds"] != receipt["testIds"]:
        raise ValueError("Training identity does not match the frozen experiment")
    if training["datasetManifestSha256"] != hashlib.sha256((WORK / "dataset" / "manifest.json").read_bytes()).hexdigest():
        raise ValueError("Dataset manifest differs from the uploaded training experiment")
    if report["cases"] != receipt["blindTests"] or report["leakage"]["status"] != "clean":
        raise ValueError("A complete, leakage-audited report is required")
    actual_hashes = {(row["id"], row["variant"]): hashlib.sha256(row["output"].encode("utf-8")).hexdigest() for row in predictions}
    if len(report["results"]) != len(expected_pairs) or any(row["outputSha256"] != actual_hashes.get((row["id"], row["variant"])) for row in report["results"]):
        raise ValueError("Report does not evaluate these exact model predictions")
    for name, wanted in training["adapterSha256"].items():
        if hashlib.sha256((artifact / "adapter" / name).read_bytes()).hexdigest() != wanted:
            raise ValueError("Adapter integrity failure")
    if not (artifact / "adapter" / "adapter_model.safetensors").is_file():
        raise ValueError("The trained adapter weights are missing")

    table = ["| Measured result | Base | LoRA specialist |", "| --- | ---: | ---: |"]
    def pair(label, values):
        table.append(f"| {label} | {values[0]} | {values[1]} |")
    variants = [report["variants"][key] for key in ("base", "specialist")]
    def assessed_fraction(passes, total):
        return f"{passes}/{total}" if total else "Not assessable"
    pair("Strict compositions accepted", [f'{v["strictPasses"]}/{v["cases"]}' for v in variants])
    pair("Finished with EOS", [f'{v["completion"]["finished"]}/{v["cases"]}' for v in variants])
    pair("Valid complete JSON composition", [f'{v["checks"]["schema"]["passes"]}/{v["cases"]}' for v in variants])
    pair("Exact UI, on evaluable compositions", [assessed_fraction(v["checks"]["ui"]["passes"], v["checks"]["ui"]["evaluated"]) for v in variants])
    pair("Audited requirement/control matches, on evaluable requirements", [assessed_fraction(v["features"]["passes"], v["features"]["assessed"]) for v in variants])
    pair("Features not assessable because composition is invalid", [str(v["features"]["notAssessed"]) for v in variants])
    pair("Median generation time (seconds)", [f'{v["latency"]["medianMs"] / 1000:.1f}' for v in variants])
    diagnostics = []
    for variant in ("base", "specialist"):
        invalid_json = input_echo = empty_composition = 0
        for row in predictions:
            if row["variant"] != variant:
                continue
            raw = row["output"].strip().removeprefix("```json").removesuffix("```").strip()
            try:
                value = json.loads(raw)
            except json.JSONDecodeError:
                invalid_json += 1
                continue
            if isinstance(value, dict):
                input_echo += set(value) == {"request", "requirements", "gameEvidence"}
                empty_composition += set(value) == {"window", "pages"} and not any(page.get("items") for page in value.get("pages", []))
        diagnostics.append(f"- {variant}: {invalid_json} syntactically invalid JSON outputs; {input_echo} input-shaped echoes; {empty_composition} compositions with no controls.")

    text = f'''# ScriptRush private specialist pilot — 2026-10-13

Actual Kaggle GPU training and paired inference, not reference-answer self-tests.
Private run: https://www.kaggle.com/code/{metadata["id"]}

Base: `{MODEL}`, revision `{REVISION}`. LoRA: {training["steps"]} optimizer steps,
{training["trainExamples"]} original synthetic training examples, {training["trainableParameters"]:,} trainable parameters,
{training["trainingSeconds"]:.1f} seconds training on {training["gpu"]}.
Training loss: {training["trainingLoss"]:.4f}; validation loss on {training["validationExamples"]} examples: {training["validationLoss"]:.4f}.
Training loss is diagnostic, not evidence of improved full hubs.

{chr(10).join(table)}

## Observed failure diagnosis

{chr(10).join(diagnostics)}

No accepted composition means this adapter is rejected for production. Syntactically
valid JSON alone is insufficient: it must contain the requested window and working controls.

All {report["cases"]} held-out cases request untitled hubs in French, with English UI and eight controls each.
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
Uploaded script SHA256: `{receipt["scriptSha256"]}`.
'''
    (HERE / "RESULTS.md").write_text(text, encoding="utf-8")
    card = text + '''
## Load the saved adapter offline

Provision the pinned base-model snapshot in a Hugging Face cache first. The archive
contains the LoRA weights and tokenizer, not the approximately 3 GB base weights.
Use the notebook's recorded package versions. Run only on a suitable local GPU:

```python
import os
os.environ["HF_HUB_OFFLINE"] = "1"
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
tokenizer = AutoTokenizer.from_pretrained("tokenizer", local_files_only=True, trust_remote_code=False)
base = AutoModelForCausalLM.from_pretrained(
    "Qwen/Qwen2.5-Coder-1.5B-Instruct",
    revision="2e1fd397ee46e1388853d2af2c993145b0f1098a",
    local_files_only=True, trust_remote_code=False,
    torch_dtype=torch.float16, device_map={"": 0})
model = PeftModel.from_pretrained(base, "adapter", is_trainable=False, local_files_only=True)
model.eval()
```

Use system/user composition messages, validate every completion and render accepted
compositions through ScriptRush's trusted renderer. Never execute unvalidated model text.
The adapter config alone does not pin the base revision, so load the explicit revision above.
The base is Apache-2.0; training fixtures are original synthetic project data.
'''
    (WORK / "MODEL_CARD.md").write_text(card, encoding="utf-8")
    bundle = WORK / "scriptrush-specialist-pilot.zip"
    with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for directory in ("adapter", "tokenizer"):
            for file in sorted((artifact / directory).rglob("*")):
                if file.is_file():
                    archive.write(file, str(file.relative_to(artifact)))
        for file in (summaries[0], artifact / "predictions.jsonl", WORK / "report.json", WORK / "submission-manifest.json", WORK / "MODEL_CARD.md", WORK / "pilot-test.jsonl"):
            archive.write(file, file.name)
    print(json.dumps({"bundle": str(bundle), "bytes": bundle.stat().st_size,
                      "sha256": hashlib.sha256(bundle.read_bytes()).hexdigest(), "report": str(HERE / "RESULTS.md")}, indent=2))


if __name__ == "__main__":
    main()
