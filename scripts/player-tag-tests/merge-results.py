#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import shutil
from datetime import datetime
from pathlib import Path


KEY_FIELDS = (
    "fixture_id",
    "player",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Merge a completed player checklist into the master "
            "player-results.csv file."
        ),
    )

    parser.add_argument(
        "checklist",
        type=Path,
        help="Completed checklist.csv to merge.",
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
        "--dry-run",
        action="store_true",
        help="Validate and report changes without writing files.",
    )

    return parser.parse_args()


def read_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(
        "r",
        encoding="utf-8",
        newline="",
    ) as file_handle:
        reader = csv.DictReader(file_handle)

        if reader.fieldnames is None:
            raise SystemExit(
                f"CSV has no header: {path}"
            )

        return reader.fieldnames, list(reader)


def row_key(row: dict[str, str]) -> tuple[str, str]:
    return tuple(
        row.get(field, "").strip()
        for field in KEY_FIELDS
    )  # type: ignore[return-value]


def validate_checklist(
    fieldnames: list[str],
    rows: list[dict[str, str]],
) -> None:
    required = {
        "fixture_id",
        "player",
        "status",
        "display_label",
        "display_value",
        "verified_at",
    }

    missing = sorted(required - set(fieldnames))

    if missing:
        raise SystemExit(
            "Checklist is missing required columns: "
            + ", ".join(missing)
        )

    keys: set[tuple[str, str]] = set()

    for line_number, row in enumerate(rows, start=2):
        key = row_key(row)

        if not all(key):
            raise SystemExit(
                f"Checklist row {line_number} has an empty key."
            )

        if key in keys:
            raise SystemExit(
                "Checklist contains a duplicate row for "
                f"{key[0]} / {key[1]}."
            )

        keys.add(key)


def main() -> int:
    args = parse_args()
    project_root = args.project_root.resolve()
    checklist_path = args.checklist.resolve()

    master_path = (
        project_root
        / "docs"
        / "player-tag-tests"
        / "player-results.csv"
    )

    if not checklist_path.is_file():
        raise SystemExit(
            f"Checklist not found: {checklist_path}"
        )

    if not master_path.is_file():
        raise SystemExit(
            f"Master results file not found: {master_path}"
        )

    checklist_fields, checklist_rows = read_rows(
        checklist_path
    )
    master_fields, master_rows = read_rows(
        master_path
    )

    validate_checklist(
        checklist_fields,
        checklist_rows,
    )

    master_by_key = {
        row_key(row): row
        for row in master_rows
    }

    editable_fields = (
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
    )

    changed = 0
    unchanged = 0

    for checklist_row in checklist_rows:
        key = row_key(checklist_row)
        master_row = master_by_key.get(key)

        if master_row is None:
            raise SystemExit(
                "Master results do not contain "
                f"{key[0]} / {key[1]}."
            )

        row_changed = False

        for field in editable_fields:
            next_value = checklist_row.get(
                field,
                "",
            ).strip()

            if master_row.get(field, "") != next_value:
                master_row[field] = next_value
                row_changed = True

        if row_changed:
            changed += 1
        else:
            unchanged += 1

    print(f"Checklist: {checklist_path}")
    print(f"Master:    {master_path}")
    print(f"Changed:   {changed}")
    print(f"Unchanged: {unchanged}")

    if args.dry_run:
        print("Dry run complete; no files written.")
        return 0

    timestamp = datetime.now().strftime(
        "%Y%m%d-%H%M%S"
    )

    backup_path = master_path.with_name(
        f"{master_path.name}.{timestamp}.bak"
    )

    shutil.copy2(
        master_path,
        backup_path,
    )

    temporary_path = master_path.with_suffix(
        ".csv.tmp"
    )

    with temporary_path.open(
        "w",
        encoding="utf-8",
        newline="",
    ) as file_handle:
        writer = csv.DictWriter(
            file_handle,
            fieldnames=master_fields,
            extrasaction="ignore",
        )

        writer.writeheader()
        writer.writerows(master_rows)

    temporary_path.replace(master_path)

    print(f"Backup:    {backup_path}")
    print("Merge complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
