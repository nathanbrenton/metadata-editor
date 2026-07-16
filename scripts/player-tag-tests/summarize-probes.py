#!/usr/bin/env python3

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    with path.open(
        "r",
        encoding="utf-8",
    ) as file_handle:
        return json.load(file_handle)


def normalized_tags(
    payload: dict[str, Any],
) -> dict[str, str]:
    tags: dict[str, str] = {}

    format_tags = (
        payload.get("format", {})
        .get("tags", {})
    )

    for key, value in format_tags.items():
        tags[f"format:{key}"] = str(value)

    for index, stream in enumerate(
        payload.get("streams", [])
    ):
        stream_tags = stream.get("tags", {})

        for key, value in stream_tags.items():
            tags[
                f"stream:{index}:{key}"
            ] = str(value)

    return tags


def main() -> int:
    if len(sys.argv) > 1:
        output_root = Path(sys.argv[1])
    else:
        output_root = Path(
            "tmp/player-tag-tests"
        )

    probe_root = output_root / "ffprobe"
    summary_path = (
        output_root /
        "ffprobe-tag-summary.csv"
    )

    if not probe_root.is_dir():
        raise SystemExit(
            f"Probe directory not found: "
            f"{probe_root}"
        )

    rows: list[dict[str, str]] = []

    for probe_path in sorted(
        probe_root.glob("*.json")
    ):
        payload = load_json(probe_path)
        tags = normalized_tags(payload)

        if not tags:
            rows.append(
                {
                    "fixture_id":
                        probe_path.stem,
                    "tag_location": "",
                    "tag_value": "",
                }
            )
            continue

        for tag_location, tag_value in sorted(
            tags.items()
        ):
            rows.append(
                {
                    "fixture_id":
                        probe_path.stem,
                    "tag_location":
                        tag_location,
                    "tag_value":
                        tag_value,
                }
            )

    with summary_path.open(
        "w",
        encoding="utf-8",
        newline="",
    ) as file_handle:
        writer = csv.DictWriter(
            file_handle,
            fieldnames=[
                "fixture_id",
                "tag_location",
                "tag_value",
            ],
        )

        writer.writeheader()
        writer.writerows(rows)

    print(summary_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
