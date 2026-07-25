# Track Directory Synchronization Browser Validation

Use a disposable or backed-up release under the configured media root. Keep Finder or a second Terminal open on the release's `tracks/` directory so browser state and filesystem state can be compared.

## Baseline

1. Open **Library** and select a release with at least two numbered track directories using `artist_01_title` naming.
2. Confirm the sidebar is ordered by disc number and saved track number.
3. Record the current directory names and hashes for one media file in each directory.

```bash
find "/path/to/release/tracks" -maxdepth 2 -type f -print0 | sort -z | xargs -0 shasum -a 256;
```

## Save does not rename

1. Enable metadata editing.
2. Change one track number.
3. Confirm the sidebar order changes immediately.
4. Click **Save edits**.
5. Confirm the TOML numbering is saved and a pending directory notice remains.
6. Confirm no directory name changed yet.
7. Confirm the success toast includes `directory synchronization pending`.

## Reviewed apply

1. Click **Review directory rename plan**.
2. Confirm the modal identifies itself as a server dry-run plan.
3. Confirm the current and target directories are correct.
4. Confirm **Apply reviewed directory renames** stays disabled until the exact displayed phrase is entered.
5. Enter `RENAME_TRACK_DIRECTORIES` and apply.
6. Confirm the modal closes, the sidebar updates to the new track ID, and the directory is renamed.
7. Confirm `track.id` and every existing `track_reference.track_id` under the renamed directory use the new ID.
8. Re-run the media hashes and confirm media bytes are unchanged.
9. Confirm a completed manifest exists under `.metadata-editor-operations/track-directory-rename-*/manifest.json`.

## Swap and cycle safety

1. Set track 1 to number 2 and track 2 to number 1.
2. Save both edits together.
3. Confirm neither directory moves during metadata save.
4. Review and apply the server plan.
5. Confirm both directories arrive at their intended names and no media is lost.

## Blocked plans

Repeat the review with each condition below. The modal should show blocked rows and the apply button should remain disabled.

- Duplicate track numbers on the same disc.
- Two tracks resolving to the same target directory ID.
- A pre-existing target directory, file, or symlink.
- A case-insensitive target collision on macOS.

Matching track numbers on different discs must remain valid.

## Stale-plan rejection

1. Load a valid review plan but do not apply it.
2. Change the release on disk so the rename plan changes, such as by creating the proposed target directory.
3. Enter the confirmation phrase and apply the old review.
4. Confirm the server rejects the stale plan and no source directory is overwritten.
5. Close or reload the review and inspect the new plan.

## Custom IDs and cancellation

1. Include a custom track directory without a recognized numeric segment.
2. Confirm it is left unchanged for manual review and does not block unrelated valid renames.
3. Open a valid review, enter part of the confirmation phrase, and cancel.
4. Confirm no directories or TOML files changed.
