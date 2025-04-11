"""Real-world check against a licensed, human-rated crisis dataset.

Dataset: av9ash/CSSR-S_labelled_suicidewatch_posts_reddit
License: CC BY 4.0
Paper:   Patil, Tao, Gedhu (2025), arXiv:2505.13480
         "Evaluating Reasoning LLMs for Suicide Screening with the
         Columbia-Suicide Severity Rating Scale"

The posts are real r/SuicideWatch posts rated on the C-SSRS 0-6 scale.
We fetch them at runtime and do not store them in this repository: they are
sensitive, and the repo does not need to carry them.

Run from backend/: uv run python eval_real.py
This needs network access and is a manual eval gate, not a unit test.
"""

import json
import urllib.request
from collections import defaultdict

import joblib

from safety import find_crisis_phrases

DATASET = "av9ash/CSSR-S_labelled_suicidewatch_posts_reddit"
ROWS_API = "https://datasets-server.huggingface.co/rows"
BASE_DIR = __file__.rsplit("/", 1)[0]


def fetch_rows():
    rows = []
    offset = 0
    while True:
        url = f"{ROWS_API}?dataset={DATASET}&config=default&split=train&offset={offset}&length=100"
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = json.load(response)
        if "error" in payload:
            raise SystemExit(f"dataset server error: {payload['error']}")
        batch = payload.get("rows", [])
        if not batch:
            break
        rows.extend(item["row"] for item in batch)
        offset += len(batch)
        if offset >= payload.get("num_rows_total", 0):
            break
    return rows


def band(severity):
    if severity >= 3:
        return "3+ active"
    if severity >= 1:
        return "1-2 passive"
    return "0 none"


def main():
    model = joblib.load(f"{BASE_DIR}/text_model.joblib")
    rows = fetch_rows()
    print(f"{len(rows)} real posts from {DATASET} (CC BY 4.0)")

    counts = defaultdict(
        lambda: {"n": 0, "rules": 0, "rules_self": 0, "model": 0, "model_08": 0, "either": 0}
    )
    misses = []
    false_fires = []

    for row in rows:
        text = row.get("content") or ""
        severity = int(row.get("severity") or 0)
        key = band(severity)

        matches = find_crisis_phrases(text)
        rules = bool(matches)
        rules_self = any(match.about_self for match in matches)
        p_high = float(model.predict_proba([text])[0][2])
        model_high = int(model.predict([text])[0]) == 2
        model_08 = p_high >= 0.8

        counts[key]["n"] += 1
        counts[key]["rules"] += int(rules)
        counts[key]["rules_self"] += int(rules_self)
        counts[key]["model"] += int(model_high)
        counts[key]["model_08"] += int(model_08)
        counts[key]["either"] += int(rules or model_08)

        if severity >= 3 and not rules:
            misses.append((severity, text))
        if severity == 0 and rules:
            false_fires.append((rules_self, text))

    print(
        f"\n{'band':12} {'n':>4} {'rules':>7} {'self':>7} "
        f"{'model':>7} {'m@.8':>7} {'either':>7}"
    )
    for key in ("0 none", "1-2 passive", "3+ active"):
        row = counts[key]
        if not row["n"]:
            continue
        print(
            f"{key:12} {row['n']:>4} "
            f"{row['rules'] / row['n']:>6.0%} {row['rules_self'] / row['n']:>6.0%} "
            f"{row['model'] / row['n']:>6.0%} {row['model_08'] / row['n']:>6.0%} "
            f"{row['either'] / row['n']:>6.0%}"
        )

    print(f"\nactive-risk posts missed by the phrase layer: {len(misses)}")
    for severity, text in misses[:8]:
        print(f"  sev={severity}  {' '.join(text.split())[:150]}")

    print(f"\nno-risk posts the phrase layer fires on: {len(false_fires)}")
    for about_self, text in false_fires[:6]:
        print(f"  about_self={about_self}  {' '.join(text.split())[:140]}")


if __name__ == "__main__":
    main()
