"""Baseline report for the text model against the reviewed eval set.

Run from backend/: uv run python eval_model.py
This measures the model alone. The app's decision layer is tested separately.
"""

import json
import os
from collections import defaultdict

import joblib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def main():
    model = joblib.load(os.path.join(BASE_DIR, "text_model.joblib"))
    with open(os.path.join(BASE_DIR, "eval_phrases.json")) as handle:
        phrases = json.load(handle)

    rows = []
    for item in phrases:
        probabilities = model.predict_proba([item["text"]])[0]
        rows.append(
            {
                **item,
                "label": int(model.predict([item["text"]])[0]),
                "p_high": float(probabilities[2]),
            }
        )

    groups = defaultdict(list)
    for row in rows:
        groups[row["category"]].append(row)

    print(f"{'category':12} {'n':>3} {'High':>5} {'mean p2':>8}")
    for category, items in groups.items():
        high = sum(1 for row in items if row["label"] == 2)
        mean_p = sum(row["p_high"] for row in items) / len(items)
        print(f"{category:12} {len(items):>3} {high:>5} {mean_p:>8.2f}")

    print("\nbenign labelled High:")
    false_positives = [row for row in groups["benign"] if row["label"] == 2]
    for row in false_positives:
        print(f"  p2={row['p_high']:.2f}  {row['text']}")
    print(f"  total: {len(false_positives)}/{len(groups['benign'])}")

    print("\nexplicit crisis missed by the model:")
    missed = [row for row in groups["explicit"] if row["label"] != 2]
    for row in missed:
        print(f"  p2={row['p_high']:.2f}  {row['text']}")
    print(f"  total: {len(missed)}/{len(groups['explicit'])}")

    print("\nnegations the model labels High:")
    negations = [row for row in groups["negation"] if row["label"] == 2]
    for row in negations:
        print(f"  p2={row['p_high']:.2f}  {row['text']}")
    print(f"  total: {len(negations)}/{len(groups['negation'])}")


if __name__ == "__main__":
    main()
