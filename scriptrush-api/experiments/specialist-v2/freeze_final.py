"""Freeze twelve final cases by metadata, before inspecting model generations.

This creates a LOCAL evaluation file with labels; do not upload that file.
The inference preparer must strip all fields except id and system/user messages.
"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "test-results" / "specialist-v2"
INDICES = (0, 2, 3, 7, 10, 11, 13, 14, 16, 18, 21, 23)
MANIFEST_SHA256 = "73dab1baacae753eb01c1b6dd41033b0bc84d3220f54c7b8cca213e581cef053"


def freeze():
    dataset = WORK / "dataset"
    actual = hashlib.sha256((dataset / "manifest.json").read_bytes()).hexdigest()
    if actual != MANIFEST_SHA256:
        raise RuntimeError("FROZEN_DATASET_MANIFEST_CHANGED")
    manifest = json.loads((dataset / "manifest.json").read_text(encoding="utf-8"))
    if hashlib.sha256((dataset / "test.jsonl").read_bytes()).hexdigest() != manifest["files"]["test"]["sha256"]:
        raise RuntimeError("FROZEN_FINAL_FILE_CHANGED")
    rows = [json.loads(line) for line in (dataset / "test.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    selected = [rows[index] for index in INDICES]
    if len(selected) != 12 or any(row["split"] != "test" for row in selected):
        raise RuntimeError("INVALID_FINAL_SELECTION")
    balance = {}
    for row in selected:
        prompt = json.loads(row["messages"][1]["content"])
        language = "fr" if prompt["request"].startswith("Crée") else "en"
        identity = "custom" if prompt["requestedUi"]["title"] else "unnamed"
        family = balance.setdefault(row["actionFamily"], set())
        family.add((language, identity))
    if len(balance) != 3 or any(len(combinations) != 4 for combinations in balance.values()):
        raise RuntimeError("FINAL_METADATA_BALANCE_FAILED")
    content = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in selected)
    destination = WORK / "pilot-test.jsonl"
    if destination.exists() and destination.read_text(encoding="utf-8") != content:
        raise RuntimeError("REFUSE_TO_REPLACE_A_DIFFERENT_FINAL_SELECTION")
    destination.write_text(content, encoding="utf-8", newline="\n")
    inputs = "".join(json.dumps({"id": row["id"], "messages": [message for message in row["messages"] if message["role"] != "assistant"]}, ensure_ascii=False) + "\n" for row in selected)
    input_file = WORK / "final-inputs.jsonl"
    if input_file.exists() and input_file.read_text(encoding="utf-8") != inputs:
        raise RuntimeError("REFUSE_TO_REPLACE_DIFFERENT_FINAL_INPUTS")
    input_file.write_text(inputs, encoding="utf-8", newline="\n")
    receipt = {"datasetManifestSha256": actual, "cases": len(selected), "ids": [row["id"] for row in selected],
        "selection": "Fixed source indices, independent of inference outcomes; each action family has French/English and unnamed/custom requests.",
        "localCaseSha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "inferenceInputSha256": hashlib.sha256(inputs.encode("utf-8")).hexdigest(),
        "labelsUploaded": False, "finalInferencePerformedByThisTool": False}
    (WORK / "final-selection.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    freeze()
