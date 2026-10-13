"""Prepare a private continuation on independently authored production prompts.

No submission. Requires the completed utility adapter and its measured summary.
The final utility and eight final production prompts/answers are never bundled.
"""
import base64
import hashlib
import json
from pathlib import Path
import re
import uuid
import zlib

HERE = Path(__file__).resolve().parent
API = HERE.parents[1]
WORK = API / "test-results" / "specialist-v2"
UTILITY_MANIFEST_SHA = "73dab1baacae753eb01c1b6dd41033b0bc84d3220f54c7b8cca213e581cef053"
MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
REVISION = "c03e6d358207e414f1eca0bb1891e29f1db0e242"


def digest(raw):
    return hashlib.sha256(raw if isinstance(raw, bytes) else raw.encode("utf-8")).hexdigest()


def read_rows(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def messages(row, include_answer):
    allowed = ("system", "user", "assistant") if include_answer else ("system", "user")
    result = [{"role": message["role"], "content": message["content"]} for message in row["messages"] if message["role"] in allowed]
    if [message["role"] for message in result] != list(allowed) or any(not isinstance(message["content"], str) or not message["content"] for message in result):
        raise RuntimeError("INVALID_STAGE_MESSAGES")
    return {"id": row["id"], "messages": result}


def prepare():
    utility = WORK / "dataset"
    production = HERE / "production" / "train" / "artifacts"
    if digest((utility / "manifest.json").read_bytes()) != UTILITY_MANIFEST_SHA:
        raise RuntimeError("UTILITY_MANIFEST_CHANGED")
    utility_manifest = json.loads((utility / "manifest.json").read_text(encoding="utf-8"))
    if digest((utility / "train.jsonl").read_bytes()) != utility_manifest["files"]["train"]["sha256"]:
        raise RuntimeError("UTILITY_TRAINING_FILE_CHANGED")
    production_manifest = json.loads((production / "manifest.json").read_text(encoding="utf-8"))
    if production_manifest.get("counts") != {"train": 48, "validation": 8, "dev": 4} or production_manifest.get("heldoutAudit", {}).get("overlaps") != []:
        raise RuntimeError("INVALID_INDEPENDENT_PRODUCTION_SPLITS")
    for name, expected in production_manifest["sourceSha256"].items():
        if ".." in Path(name).parts or digest((API / "src" / "lib" / name).read_bytes()) != expected:
            raise RuntimeError("PRODUCTION_SOURCES_CHANGED_RECAPTURE_REQUIRED")
    rows = {}
    for split, count in (("train", 48), ("validation", 8), ("dev", 4)):
        source = production / f"{split}.jsonl"
        if digest(source.read_bytes()) != production_manifest["files"][split]["sha256"]:
            raise RuntimeError("PRODUCTION_SPLIT_HASH_MISMATCH")
        rows[split] = read_rows(source)
        if len(rows[split]) != count or any(row["split"] != split for row in rows[split]):
            raise RuntimeError("PRODUCTION_SPLIT_COUNT_OR_ROLE_MISMATCH")
    rehearsal = read_rows(utility / "train.jsonl")[:96]
    if len(rehearsal) != 96 or any(row["split"] != "train" for row in rehearsal):
        raise RuntimeError("INVALID_UTILITY_REHEARSAL")
    rows["train"] += rehearsal
    identifiers = [row["id"] for group in rows.values() for row in group]
    if len(set(identifiers)) != len(identifiers):
        raise RuntimeError("DUPLICATE_TEACHING_CASE")

    summaries = list((WORK / "kaggle-output").rglob("training-summary.json"))
    if len(summaries) != 1:
        raise RuntimeError("COMPLETED_UTILITY_SUMMARY_REQUIRED")
    initial = json.loads(summaries[0].read_text(encoding="utf-8"))
    if initial.get("model") != MODEL or initial.get("revision") != REVISION or initial.get("datasetManifestSha256") != UTILITY_MANIFEST_SHA or initial.get("steps") != 96:
        raise RuntimeError("UNEXPECTED_INITIAL_MODEL")
    hashes = initial.get("adapterSha256", {})
    if not {"adapter_config.json", "adapter_model.safetensors"} <= hashes.keys():
        raise RuntimeError("COMPLETED_UTILITY_ADAPTER_REQUIRED")
    for name, expected in hashes.items():
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or not re.fullmatch(r"[a-f0-9]{64}", expected) or digest((summaries[0].parent / "adapter" / name).read_bytes()) != expected:
            raise RuntimeError("INITIAL_ADAPTER_HASH_MISMATCH")
    notebook = json.loads((WORK / "kaggle-run" / "kernel-metadata.json").read_text(encoding="utf-8"))["id"]
    if not re.fullmatch(r"sciptrush/scriptrush-specialist-v2-[a-z0-9]+", notebook):
        raise RuntimeError("UNEXPECTED_PRIVATE_INITIAL_NOTEBOOK")

    run = WORK / "production-kaggle-run"
    if (run / "train.py").exists() or (run / "kernel-metadata.json").exists():
        raise RuntimeError("PRESERVE_EXISTING_PRODUCTION_SUBMISSION_BEFORE_REPREPARING")
    dataset = WORK / "production-dataset"
    dataset.mkdir(parents=True, exist_ok=True)
    local_hashes = {}
    for split, group in rows.items():
        content = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in group)
        (dataset / f"{split}.jsonl").write_text(content, encoding="utf-8", newline="\n")
        local_hashes[split] = digest(content)
    manifest = {"stage": "production-resume-v2", "utilityManifestSha256": UTILITY_MANIFEST_SHA,
        "productionManifestSha256": digest((production / "manifest.json").read_bytes()), "filesSha256": local_hashes,
        "counts": {split: len(group) for split, group in rows.items()},
        "rehearsalIds": [row["id"] for row in rehearsal], "finalInputsIncluded": False, "finalAnswersIncluded": False}
    manifest_raw = json.dumps(manifest, indent=2) + "\n"
    (dataset / "manifest.json").write_text(manifest_raw, encoding="utf-8", newline="\n")
    manifest_hash = digest(manifest_raw)
    bundle = {split: [messages(row, include_answer=split != "dev") for row in group] for split, group in rows.items()}
    bundle["manifestSha256"] = manifest_hash
    bundle["run"] = {"steps": 32, "evaluationSteps": 16, "learningRate": 3e-5, "maxContext": 8192,
        "assistantLogitsOnly": True, "initialAdapterSha256": hashes,
        "initialSummarySha256": digest(summaries[0].read_bytes()), "initialManifestSha256": UTILITY_MANIFEST_SHA}
    from tokenizers import Tokenizer
    tokenizer = Tokenizer.from_pretrained(MODEL, revision=REVISION)
    lengths = []
    for split in ("train", "validation"):
        for row in bundle[split]:
            chat = "".join(f'<|im_start|>{message["role"]}\n{message["content"]}<|im_end|>\n' for message in row["messages"])
            size = len(tokenizer.encode(chat, add_special_tokens=False).ids)
            if size > 8192:
                raise RuntimeError("COMPLETE_TEACHING_EXAMPLE_TOO_LONG_NO_TRUNCATION")
            lengths.append(size)
    payload = base64.b64encode(zlib.compress(json.dumps(bundle, ensure_ascii=False).encode("utf-8"), 9)).decode("ascii")
    script = f'SCRIPTRUSH_DATA_BUNDLE = "{payload}"\n' + (HERE / "kaggle_train.py").read_text(encoding="utf-8")
    run.mkdir(parents=True, exist_ok=True)
    (run / "train.py").write_text(script, encoding="utf-8", newline="\n")
    suffix = uuid.uuid4().hex[:8]
    metadata = {"id": "sciptrush/scriptrush-v2-production-" + suffix, "title": "ScriptRush v2 production " + suffix,
        "code_file": "train.py", "language": "python", "kernel_type": "script", "is_private": True,
        "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4", "dataset_sources": [], "competition_sources": [], "kernel_sources": [notebook]}
    (run / "kernel-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8", newline="\n")
    receipt = {"stage": "production-resume-v2", "model": MODEL, "revision": REVISION,
        "sourceNotebook": notebook, "notebook": metadata["id"], "initialAdapterSha256": hashes,
        "initialSummarySha256": digest(summaries[0].read_bytes()), "datasetManifestSha256": manifest_hash,
        "scriptSha256": digest(script), "counts": manifest["counts"], "run": bundle["run"],
        "maxMeasuredFullTokens": max(lengths), "developmentLabelsUploaded": False,
        "finalInputsUploaded": False, "finalAnswersUploaded": False, "private": True}
    (WORK / "production-submission-manifest.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(receipt))
    return receipt


if __name__ == "__main__":
    prepare()
