"""Build a private Kaggle script; never upload test labels, account data or credentials."""
import base64
import hashlib
import json
from pathlib import Path
import uuid
import zlib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WORK = ROOT / "test-results" / "specialist"


def prepare(test_limit=6):
    dataset = WORK / "dataset"
    rows = {split: [json.loads(line) for line in (dataset / f"{split}.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
            for split in ("train", "validation", "test")}
    # Freeze the first pilot's deterministic spread. This subset covers three
    # layouts/action families, but only French requests with an absent title;
    # it must not be described as balanced for language or customization.
    selected = [rows["test"][index * len(rows["test"]) // test_limit] for index in range(test_limit)]
    (WORK / "pilot-test.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in selected), encoding="utf-8")
    bundle = {split: [{"id": row["id"], "messages": row["messages"]} for row in rows[split]] for split in ("train", "validation")}
    bundle["test"] = [{"id": row["id"], "messages": [message for message in row["messages"] if message["role"] != "assistant"]} for row in selected]
    bundle["manifestSha256"] = hashlib.sha256((dataset / "manifest.json").read_bytes()).hexdigest()
    for row in bundle["test"]:
        if set(row) != {"id", "messages"} or [message["role"] for message in row["messages"]] != ["system", "user"]:
            raise ValueError("Test payload must contain only blinded input messages")
    payload = base64.b64encode(zlib.compress(json.dumps(bundle, ensure_ascii=False).encode("utf-8"), 9)).decode("ascii")
    script = f'SCRIPTRUSH_DATA_BUNDLE = "{payload}"\n' + (HERE / "kaggle_train.py").read_text(encoding="utf-8")
    run = WORK / "kaggle-run"
    run.mkdir(parents=True, exist_ok=True)
    (run / "train.py").write_text(script, encoding="utf-8")
    suffix = uuid.uuid4().hex[:8]
    metadata = {"id": "owner/scriptrush-specialist-pilot-" + suffix, "title": "ScriptRush specialist pilot " + suffix,
                "code_file": "train.py", "language": "python", "kernel_type": "script", "is_private": True,
                "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4",
                "dataset_sources": [], "competition_sources": [], "kernel_sources": []}
    (run / "kernel-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    receipt = {"train": len(bundle["train"]), "validation": len(bundle["validation"]), "blindTests": len(selected),
               "testIds": [row["id"] for row in selected], "scriptSha256": hashlib.sha256(script.encode("utf-8")).hexdigest(),
               "testLabelsUploaded": False, "private": True, "model": "Qwen/Qwen2.5-Coder-1.5B-Instruct"}
    (WORK / "submission-manifest.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt))
    return receipt


if __name__ == "__main__":
    prepare()
