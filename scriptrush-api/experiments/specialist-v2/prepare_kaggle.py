"""Freeze development inputs; never upload final test cases during tuning."""
import base64
import hashlib
import json
from pathlib import Path
import uuid
import zlib

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "test-results" / "specialist-v2"


def prepare():
    dataset = WORK / "dataset"
    rows = {split: [json.loads(line) for line in (dataset / f"{split}.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
            for split in ("train", "validation", "dev")}
    # Fixed metadata-only selection: three layouts/action combinations, both
    # request languages, absent/custom/quoted titles. No outcome-based sampling.
    indices = [0, 4, 11, 12]
    selected = [rows["dev"][index] for index in indices]
    (WORK / "pilot-dev.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in selected), encoding="utf-8", newline="\n")
    bundle = {split: [{"id": row["id"], "messages": row["messages"]} for row in rows[split]] for split in ("train", "validation")}
    bundle["dev"] = [{"id": row["id"], "messages": [message for message in row["messages"] if message["role"] != "assistant"]} for row in selected]
    bundle["manifestSha256"] = hashlib.sha256((dataset / "manifest.json").read_bytes()).hexdigest()
    bundle["run"] = {"steps": 96}
    assert "test" not in bundle
    assert all([message["role"] for message in row["messages"]] == ["system", "user"] for row in bundle["dev"])
    payload = base64.b64encode(zlib.compress(json.dumps(bundle, ensure_ascii=False).encode("utf-8"), 9)).decode("ascii")
    script = f'SCRIPTRUSH_DATA_BUNDLE = "{payload}"\n' + (HERE / "kaggle_train.py").read_text(encoding="utf-8")
    run = WORK / "kaggle-run"
    run.mkdir(parents=True, exist_ok=True)
    (run / "train.py").write_text(script, encoding="utf-8", newline="\n")
    suffix = uuid.uuid4().hex[:8]
    metadata = {"id": "owner/scriptrush-specialist-v2-" + suffix, "title": "ScriptRush specialist v2 " + suffix,
                "code_file": "train.py", "language": "python", "kernel_type": "script", "is_private": True,
                "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4",
                "dataset_sources": [], "competition_sources": [], "kernel_sources": []}
    (run / "kernel-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8", newline="\n")
    receipt = {"train": len(bundle["train"]), "validation": len(bundle["validation"]), "developmentCases": len(selected),
        "developmentIds": [row["id"] for row in selected], "steps": 96, "effectiveBatchSize": 4,
        "scriptSha256": hashlib.sha256(script.encode("utf-8")).hexdigest(), "developmentLabelsUploaded": False,
        "finalTestInputsUploaded": False, "finalTestLabelsUploaded": False, "private": True,
        "model": "Qwen/Qwen2.5-Coder-7B-Instruct", "revision": "c03e6d358207e414f1eca0bb1891e29f1db0e242"}
    (WORK / "submission-manifest.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    prepare()
