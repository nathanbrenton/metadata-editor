#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import shutil
from pathlib import Path


PLAYERS = {
    "vlc": "VLC",
    "apple-music": "Apple Music",
    "windows-media-player": "Windows Media Player",
    "windows-media-player-legacy":
        "Windows Media Player Legacy",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Prepare manual player-tag test batches from the "
            "generated metadata fixtures."
        ),
    )

    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help=(
            "Metadata-editor project root. Defaults to the "
            "current directory."
        ),
    )

    parser.add_argument(
        "--player",
        choices=sorted(PLAYERS),
        required=True,
        help="Player batch to prepare.",
    )

    parser.add_argument(
        "--output-root",
        type=Path,
        default=None,
        help=(
            "Optional output directory. Defaults under "
            "tmp/player-tag-tests/manual-batches/."
        ),
    )

    parser.add_argument(
        "--copy",
        action="store_true",
        help=(
            "Copy fixtures instead of creating relative symbolic "
            "links."
        ),
    )

    return parser.parse_args()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(
        "r",
        encoding="utf-8",
        newline="",
    ) as file_handle:
        return list(csv.DictReader(file_handle))


def safe_name(value: str) -> str:
    return (
        value.lower()
        .replace(" ", "-")
        .replace("/", "-")
        .replace("_", "-")
    )


def main() -> int:
    args = parse_args()
    project_root = args.project_root.resolve()

    test_root = (
        project_root /
        "tmp" /
        "player-tag-tests"
    )

    manifest_path = (
        test_root /
        "fixture-manifest.csv"
    )

    results_path = (
        project_root /
        "docs" /
        "player-tag-tests" /
        "player-results.csv"
    )

    if not manifest_path.is_file():
        raise SystemExit(
            f"Fixture manifest not found: {manifest_path}"
        )

    if not results_path.is_file():
        raise SystemExit(
            f"Player results CSV not found: {results_path}"
        )

    player_name = PLAYERS[args.player]

    output_root = (
        args.output_root.resolve()
        if args.output_root
        else (
            test_root /
            "manual-batches" /
            args.player
        )
    )

    fixture_output = output_root / "fixtures"
    checklist_path = output_root / "checklist.csv"
    instructions_path = output_root / "README.txt"

    if output_root.exists():
        shutil.rmtree(output_root)

    fixture_output.mkdir(parents=True)

    manifest = {
        row["fixture_id"]: row
        for row in read_csv(manifest_path)
    }

    result_rows = [
        row
        for row in read_csv(results_path)
        if (
            row["player"] == player_name
            and row["ffprobe_status"] == "preserved"
            and row["metadata_field"] != "combined"
        )
    ]

    prepared_rows: list[dict[str, str]] = []

    for index, row in enumerate(result_rows, start=1):
        fixture = manifest[row["fixture_id"]]

        source_path = (
            test_root /
            fixture["relative_path"]
        )

        if not source_path.is_file():
            raise SystemExit(
                f"Fixture not found: {source_path}"
            )

        extension = source_path.suffix

        output_name = (
            f"{index:03d}__"
            f"{safe_name(row['container'])}__"
            f"{safe_name(row['metadata_field'])}"
            f"{extension}"
        )

        destination_path = (
            fixture_output /
            output_name
        )

        if args.copy:
            shutil.copy2(
                source_path,
                destination_path,
            )
        else:
            destination_path.symlink_to(
                source_path,
            )

        prepared = dict(row)
        prepared["batch_order"] = str(index)
        prepared["batch_filename"] = output_name
        prepared_rows.append(prepared)

    fieldnames = [
        "batch_order",
        "batch_filename",
        "fixture_id",
        "container",
        "metadata_field",
        "ffmpeg_key",
        "test_value",
        "ffprobe_status",
        "ffprobe_locations",
        "player",
        "player_version",
        "operating_system",
        "os_version",
        "import_method",
        "display_location",
        "display_label",
        "display_value",
        "status",
        "notes",
        "verified_at",
    ]

    with checklist_path.open(
        "w",
        encoding="utf-8",
        newline="",
    ) as file_handle:
        writer = csv.DictWriter(
            file_handle,
            fieldnames=fieldnames,
            extrasaction="ignore",
        )

        writer.writeheader()
        writer.writerows(prepared_rows)

    instructions = f"""PLAYER METADATA MANUAL TEST BATCH

Player:
  {player_name}

Fixtures:
  {len(prepared_rows)}

Procedure:
  1. Record the exact player version.
  2. Record the operating system and version.
  3. Open or import fixtures in batch-order sequence.
  4. Search for the APTEST value shown in checklist.csv.
  5. Record the exact player-visible label and value.
  6. Record the display location.
  7. Set status to verified, partial, not-visible, blocked,
     or inconclusive.
  8. Add the observation date to verified_at.

Important:
  These fixtures were included only when FFprobe confirmed that
  FFmpeg wrote the requested test value. A missing player display
  should therefore be recorded as not-visible rather than as a
  fixture-generation failure.

Generated files:
  fixtures/
  checklist.csv
  README.txt
"""

    instructions_path.write_text(
        instructions,
        encoding="utf-8",
    )

    print(f"Player:    {player_name}")
    print(f"Fixtures:  {len(prepared_rows)}")
    print(f"Output:    {output_root}")
    print(f"Checklist: {checklist_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
