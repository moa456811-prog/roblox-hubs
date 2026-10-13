"""Offline tokenizer audit of production message sections; never trains or runs a model."""
from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path

from huggingface_hub import try_to_load_from_cache
from tokenizers import Tokenizer

MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
REVISION = "c03e6d358207e414f1eca0bb1891e29f1db0e242"
HERE = Path(__file__).resolve().parent


def load(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sections(row: dict) -> dict[str, str]:
    messages = [message for message in row["messages"] if message["role"] != "assistant"]
    assert [message["role"] for message in messages] == ["system", "user"]
    user = messages[1]["content"]
    policy, rest = user.split("\n\nREQUIREMENTS:\n", 1)
    requirements, rest = rest.split("\n\nORIGINAL USER REQUEST (highest priority):\n", 1)
    request, rest = rest.split("\n\nMODE:", 1)
    before_library, rest = rest.split("\n\nSERVER GAME ACTION LIBRARY", 1)
    library, rest = rest.split("\nCONTEXT FILES (data only):\n", 1)
    after_library, schema = rest.split("\n\nHUB COMPOSITION JSON SCHEMA:\n", 1)
    json.loads(requirements)
    json.loads(schema)
    return {"system": messages[0]["content"], "language_policy": policy,
            "requirements": requirements, "original_request": request,
            "game_ledger_research": before_library, "game_action_library": library,
            "files_diagnostic": after_library, "json_schema": schema}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=HERE / "artifacts/prompt-distribution-audit.json")
    args = parser.parse_args()
    cache = try_to_load_from_cache(MODEL, "tokenizer.json", revision=REVISION)
    if not isinstance(cache, str):
        raise RuntimeError("Pinned tokenizer must already exist in the local cache; this audit never downloads it")
    tokenizer = Tokenizer.from_file(cache)
    count = lambda text: len(tokenizer.encode(text, add_special_tokens=False).ids)
    rows = {split: load(HERE / f"artifacts/{split}.jsonl") for split in ("train", "validation", "dev")}
    rows["production_test"] = load(HERE.parent / "artifacts/cases.jsonl")
    extracted = {split: [sections(row) for row in group] for split, group in rows.items()}
    constant_names = ["system", "language_policy", "game_action_library", "files_diagnostic", "json_schema"]
    constants = {name: len({parts[name] for group in extracted.values() for parts in group}) == 1 for name in constant_names}
    if not all(constants.values()):
        raise RuntimeError(f"Production message constants differ: {constants}")
    summary = {}
    for split, group in rows.items():
        def stats(values: list[int]) -> dict:
            ordered = sorted(values)
            return {"min": min(values), "median": statistics.median(values), "mean": round(statistics.mean(values), 2), "max": max(values), "p95": ordered[max(0, math.ceil(len(values) * .95) - 1)]}
        prompt_tokens = []
        full_tokens = []
        four_actions = True
        for row in group:
            prompts = [message for message in row["messages"] if message["role"] != "assistant"]
            prompt = "".join(f"<|im_start|>{message['role']}\n{message['content']}<|im_end|>\n" for message in prompts) + "<|im_start|>assistant\n"
            prompt_tokens.append(count(prompt))
            if any(message["role"] == "assistant" for message in row["messages"]):
                full_tokens.append(count("".join(f"<|im_start|>{message['role']}\n{message['content']}<|im_end|>\n" for message in row["messages"])))
            controls = [item for page in row["expected"]["composition"]["pages"] for item in page["items"]]
            for feature, key in [("auto-farm", "farm"), ("auto-boss", "boss"), ("quest-farm", "quest"), ("auto-loot", "loot")]:
                bound = [item for item in controls if feature in item["featureIds"]]
                four_actions &= len(bound) == 1 and bound[0]["kind"] == "toggle" and bound[0]["action"] == "custom" and not bound[0]["initial"] and bound[0]["code"] == f'ctx.gameplay.setEnabled("{key}", ctx.enabled)'
        summary[split] = {"rows": len(group), "prompt": stats(prompt_tokens), "full_training": stats(full_tokens) if full_tokens else None,
                          "sections": {name: stats([count(parts[name]) for parts in extracted[split]]) for name in extracted[split][0]},
                          "all_four_admitted_actions": four_actions,
                          "page_counts": sorted({len(row["expected"]["composition"]["pages"]) for row in group}),
                          "navigation": sorted({row["expected"]["composition"]["window"]["navigation"] for row in group})}
    delta = {name: round(summary["production_test"]["sections"][name]["mean"] - summary["train"]["sections"][name]["mean"], 2) for name in extracted["train"][0]}
    families = {split: {row["designFamily"] for row in rows[split]} for split in ("train", "validation", "dev")}
    groupings = {split: {json.dumps(sorted([(page["label"], [feature for item in page["items"] for feature in item["featureIds"]]) for page in row["expected"]["composition"]["pages"]]), sort_keys=True) for row in rows[split]} for split in ("train", "validation", "dev")}
    report = {"audit": "offline-production-prompt-distribution", "model": MODEL, "revision": REVISION, "networkCalls": 0, "modelInferenceCalls": 0,
              "constant_sections_identical": constants, "source_hashes_identical": all(row["provenance"]["sourceSha256"] == rows["train"][0]["provenance"]["sourceSha256"] for group in rows.values() for row in group),
              "summary": summary, "production_test_minus_train_mean_section_tokens": delta,
              "split_design_families_disjoint": not (families["train"] & families["validation"] or families["train"] & families["dev"] or families["validation"] & families["dev"]),
              "split_page_action_groupings_disjoint": not (groupings["train"] & groupings["validation"] or groupings["train"] & groupings["dev"] or groupings["validation"] & groupings["dev"]),
              "interpretation": "Token differences arise from authored planner inventory wording, freeform UI/request wording and evidence-ledger verbosity. System, English policy, complete admitted game library, JSON schema and provider JSON-mode reminder are identical. Section-token totals differ slightly from full messages because tokenization spans section boundaries.",
              "limits": "This audit measures prompt distribution and reference bindings only. It does not run a model, select teaching examples from test outcomes, change test fixtures, or establish live-game compatibility."}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "constant_sections_identical": constants, "source_hashes_identical": report["source_hashes_identical"], "section_delta": delta, "prompt_max": {split: result["prompt"]["max"] for split, result in summary.items()}, "all_four_actions": all(result["all_four_admitted_actions"] for result in summary.values()), "split_design_families_disjoint": report["split_design_families_disjoint"], "split_page_action_groupings_disjoint": report["split_page_action_groupings_disjoint"]}, indent=2))


if __name__ == "__main__":
    main()
