# Metadata Editor

A local React + TypeScript application for safely scanning a structured media library, inspecting release and track metadata, previewing inferred values, generating validated TOML, and creating missing metadata files without overwriting existing content.

The editor is designed for a record-label / production-company media ecosystem and runs as a separate administrative application from the public audio player.

## Status

Current version:

```text
0.0.1
```

Implemented capabilities:

- Scan a configured media root for releases and tracks
- Discover releases and tracks even when TOML files are missing
- Detect likely audio and artwork master assets
- Report missing release- and track-level metadata files
- Display scanner warnings for missing or ambiguous assets
- Preview low-risk inferred metadata values
- Render generated TOML entirely in memory
- Validate generated TOML with `smol-toml`
- Build create/blocked generation plans
- Generate release-only, track-only, or all missing metadata
- Require explicit typed confirmation before file creation
- Create missing files without overwriting existing metadata
- Re-read and validate created TOML files after writing
- Return SHA-256 verification receipts
- Display parsed metadata as document-style key/value tables
- Show raw TOML alongside structured metadata
- Preview inspected Ingest/Staging audio and Library release tracks through one always-visible persistent application-level player footer that survives workspace navigation; the footer spans the same desktop width as metadata-editor, shows the prepared waveform for Library tracks when available, and falls back to an ordinary seek control for source previews without prepared peaks. Space is reserved for play/pause everywhere except actual text-entry fields. The application menu exposes the same 3Band, RGB, Blue, and Monochrome waveform palette choices as the Hiplingo player, and the selected palette applies to both the footer and Library Waveform view. The footer now renders the same shared compact Now Playing and volume-control structure as the Hiplingo web app while metadata-editor continues to own its private playback engine and source adapter. Library also offers a Waveform browser mode with large artwork, previous/next release browsing, authored track order/titles, and the shared Hiplingo fixed-center scrolling waveform over private `waveform-peaks.json`; mouse/touch scrubbing activates the selected Library track when needed and provides brief audible scrub auditions while still driving the same persistent private player The footer consumes the same shared speaker-button/vertical 0–100 volume control and perceptual volume curve as Hiplingo, and the footer artwork is the temporary Waveform shortcut that returns the active Library release to its single-release Waveform viewer.
- Library browsing starts in Artwork-First Tiles mode on every fresh browser load or reload. Rows, Cards, and Waveform are in-session choices only; the Library view mode is not persisted across refreshes. The footer artwork can still explicitly switch the current session to the active release's single-release Waveform viewer.
- Library Waveform reserves the final visualization and technical-detail space while a newly selected track's peaks load, preventing track changes from shifting the surrounding Library layout.
- Stream preview audio through a root-confined, byte-range-aware local API
- Prefer generated `audio-playback` files and fall back to one unambiguous audio master
- Edit scalar values locally in the browser with dirty-state tracking
- Edit release- and track-level songwriting, composer, and lyricist credits with guided roles and release inheritance
- Credit track-level samples, interpolations, musical quotations, and lyrical quotations with structured source data and liner-note wording
- Track private sample-clearance status, master-use and publishing approval, agreement references, territories, and expiration dates

Scalar edits are currently browser-local only. Persisting edits to existing TOML files is planned but not yet implemented.

## Workspace Layout

```text
~/Desktop/record-label/
├── audio-player/
├── metadata-editor/
├── ingest-drop/          # incoming read-only source candidates
├── media-library/        # private canonical release Library; Staging writes here
└── published-media/      # generated host-facing website media snapshot
```

Repository boundaries:

- `metadata-editor/` is its own Git repository.
- `audio-player/` is a separate Git repository and is evolving into the Hiplingo public web application. Its `packages/media-player/` subpackage contains reusable player primitives consumed by both Hiplingo and metadata-editor, including compact and fixed-center scrubbable waveform rendering/colors, transport SVGs, player time formatting, the Spacebar shortcut contract, the shared compact Now Playing/volume shell and perceptual volume curve, a queue-neutral transport-controller shape, stable queue navigation helpers, and the normalized playable-media item contract used for title/artist/release identity, artwork, waveform, and host-owned source descriptors; each host still owns its own audio engine, queue state, and data adapter.
- `ingest-drop/`, `media-library/`, and `published-media/` remain outside both application repositories.
- Private canonical roots and public deployment output must not be committed with either application source repository.
- Do not initialize Git at `~/Desktop/record-label/`.

## Architecture

The application uses two local development processes:

```text
127.0.0.1:5174  React/Vite frontend
127.0.0.1:4174  Node/TypeScript filesystem API
```

The backend binds only to localhost during development. The public audio player does not expose or embed this editor.

### Frontend

- React
- TypeScript
- Vite
- Desktop-first workflow navigation: Ingest → Staging → Library → Web Package → Live
- Compact application header uses the supplied Hiplingo logo image as the global Home → Library control; the redundant visible Hiplingo wordmark is omitted, while Workflow & Help retains contextual Back to editor navigation.
- Ingest recognizes audio, video, image, and text sources. Candidate identity and destination are separate concerns: a dedicated Target release control can Auto-select one exact unambiguous Library match, force New release, or explicitly select any Existing Library release even when the ingest folder/filename differs from the canonical Library directory. An existing target carries its canonical release ID and authored release identity into Staging so later video, artwork, sidecar, replacement-master, or other asset candidates update the intended release instead of deriving a new destination from source naming. Video extensions such as `.mp4`, `.mov`, `.mkv`, and `.mxf` are treated as video candidates and ffprobe verifies non-attached video streams during inspection; duration, dimensions, frame rate, primary video codec, pixel format, and companion audio codec remain available in Details. Probe-verified video can continue to Staging, where each included source receives a reviewed stable ID, flexible descriptive type, canonical `videos/<stable-id>/video-master.<original-extension>` destination, sibling `video.toml`, and optional semantic relationship to an included track while remaining release-scoped. Existing verified videos omitted from later candidates are preserved. The Library scanner recognizes canonical video directories, validates master/metadata/track-reference shape, counts videos in Library summaries, and exposes a compact per-release video disclosure with identity, type, relationship, and master readiness. Browser-direct MP4, M4V, MOV, and WebM canonical masters can be previewed read-only from that disclosure without creating a derivative; actual codec playback still depends on the browser. The same Library disclosure can author video title, flexible type, description, date, location, director, camera operator, authored display order, optional poster-frame time in seconds, and optional related-track relationship directly in canonical video.toml through a concurrency-checked, backup-preserving atomic write; stable video ID and canonical master path remain immutable in this editor. Library video rows follow authored display order and show the prepared private poster when available. The private web-video derivative uses one deterministic H.264 High 4.1/yuv420p + AAC-LC HLS rendition: fit within 1280×720 without upscaling, preserve source frame rate up to 60 fps, bounded CRF 20 encoding through libx264, 192 kbps stereo AAC-LC when source audio is present, and three-second independent fMP4 segments. Video presentation profile v3 also creates `stream/poster.png`: blank poster time uses deterministic automatic thumbnail selection, while an authored timestamp seeks to that frame; either path is fit within 1280×720 and the poster selection participates in derivative freshness. The profile and canonical source identity are hashed independently so stream/poster preparation can distinguish source changes from profile changes. The guarded preparation backend stages `videos/<stable-id>/stream/`, validates the HLS structure, poster presence, and a full FFmpeg decode pass, rechecks the reviewed source/profile fingerprint before promotion, verifies SHA-256 integrity after promotion, and rolls back replacements if validation fails. Web Package Ready Check includes private video-media readiness, offers a dedicated Prepare video media step for missing or stale video derivatives, and public-package contract v5 publishes ordered sanitized `video.json`, `stream/poster.png`, and current H.264/AAC HLS resources under each canonical video ID. Canonical `video-master.*`, `video.toml`, and private `stream-info.json` remain excluded from published-media. Live preview transcoding, canonical-video replacement, and player-side video presentation remain later milestones.
- Publish contract v5 plans a host-ready audio/video layout under `published-media/releases/<release-id>/`, including ordered `videos/<video-id>/video.json`, `videos/<video-id>/stream/poster.png`, and current H.264/AAC HLS resources while excluding canonical video masters, `video.toml`, and private `stream-info.json` preparation sidecars.
- Ingest candidate inspection can seed release artist and title from selectable folder-field ranges or embedded album/artist tags. Continuing to Staging explicitly carries those selected values into the draft, including over an older locally saved inferred identity, while keeping the fields editable. Detailed inference evidence stays collapsed by default beneath the identity controls, and candidate file counts and media totals are condensed into the existing Source files header.
- Ingest also treats source hierarchy as evidence. Numbered first-level folders such as `01/`, `track-02/`, or `03_track-name/` can seed track numbers. When one audio file and one image occupy the same numbered track scope, the image is suggested as that track's `front_cover` even when the filenames differ. A single image at the candidate release root is suggested as release-level `front_cover`; a single image under a release `artwork/`, `cover/`, or `covers/` folder is a secondary release-artwork hint. Ambiguous folders with multiple audio or image candidates remain unassigned for review.
- Library release rows show the authored release title and primary artist above the date and track count
- Library audio preview automatically advances to the next playable track in release order when a track ends, and stops after the final playable track; manual previous/next transport navigation retains its existing wraparound behavior.
- Developer / Admin Tools start disabled on every page load and remain session-only when enabled
- The Staging track table shows source paths relative to the selected candidate, provides read-only play/pause preview for inspected audio, uses direct three-digit track-number entry for ordering, can populate selected titles from a chosen filename field or each file's embedded TITLE tag, supports applying one source date across all included non-missing sources, and reports source dates after the release date as non-blocking advisories. When the release ID already exists in `media-library/`, Staging also shows a Revision action column: existing Library tracks omitted from the new ingest candidate are preserved automatically, while an explicitly selected `Replace Track N` action replaces only that track's verified canonical audio, preserves its stable ID and authored metadata, invalidates generated private playback/HLS derivatives, and refreshes the Library waveform from the replacement master during the guarded Build.
- Staging Artwork & files uses a compact thumbnail-only palette plus release/track destination rows for visual front-artwork assignment. The palette deliberately omits filenames, paths, status badges, assignment badges, and action buttons; thumbnails can be dragged to a destination or selected by click/keyboard for the non-drag fallback. Source review and detach/remove controls live with the collapsed advanced artwork editor, which repeats a compact thumbnail beside each source's role controls and uses source-level dividers and spacing so alternate and secondary-role assignments remain visually identifiable. Scope and role changes on existing assignments are applied immediately with a success toast. Add artwork assignment or Add another assignment opens an unapplied draft; Apply assignment commits it with a success toast, while Cancel discards it. Source ready reports only source validation/readiness and does not claim that the artwork is assigned; unchanged artwork sources in the advanced editor omit the redundant standalone success icon so source readiness cannot be mistaken for assignment success. On existing-release revisions, preserved Library tracks remain eligible in the advanced assignment track list even when their original audio is absent from the current candidate; intentionally excluded candidate-only tracks remain disabled. Folder-derived suggestions still appear on their inferred release or numbered track rows automatically, and TIFF/TIF previews are generated in memory through FFmpeg without modifying the ingest source. During an existing-release update, current canonical Library artwork is shown on the same destination rows, existing tracks remain targetable even when no audio from those tracks is in the new candidate, new artwork roles can be added, and replacing an occupied front-artwork target requires an explicit confirmation before the verified Library copy and its TOML reference may be superseded.
- MP3 and other audio sources with FFprobe attached-picture streams expose deduplicated embedded artwork in Staging Artwork & files. One unambiguous embedded cover is preassigned as the release-level `front_cover` and extracted only when the reviewed staging plan is applied; the audio source is never retagged or modified.
- Artwork copy destinations follow their explicit assignment scope. Release-level front artwork is staged under `artwork/front/artwork-master.<ext>`. Track-level `front_cover` / `track_artwork` assignments are copied into each selected track under `tracks/<track-id>/artwork/front/artwork-master.<ext>` and track TOML uses a track-local `artwork/front/...` path. Assigning one source to both release and track scopes intentionally creates independent canonical copies.
- Advanced Staging artwork assignments use a controlled role dropdown. Release-level `alternate_front_cover` stores a supplemental front-cover alternative under its own `artwork/alternate/<assignment-id>/` target; it remains non-primary and does not replace the canonical `front_cover`.
- Staging step 5 is **Build** rather than Review. The server-validated Preview/Refresh build-plan action is promoted to the top of the workspace, followed by a final release-oriented view of release artwork and identity, numbered track titles with source-audio preview, effective front art, and a compact **Build readiness** summary before any write. On an existing-release revision, the track table shows the final resulting track set rather than only candidate sources: untouched canonical tracks are `Existing Library / Preserved`, new candidate tracks are `New`, and candidate tracks that explicitly revise a stable existing track are `Existing Library / Modified`. The build plan explicitly reports waveform create/refresh/current counts. Server-validated warnings remain visible; exact artwork placement, filesystem operations, waveform operations, and metadata/TOML changes are retained in collapsed technical-detail sections, where plan rows still use compact file-kind icons and green-check/red-x readiness indicators. Existing canonical releases can also be reopened directly from the Staging release overview by clicking the release row even when no Ingest candidate is selected. When that plan contains waveform writes, its JSON-only confirmation and **Build Library waveforms** action are kept in the Build workspace header beside the navigation controls instead of below the track table. This candidate-free repair mode previews a fingerprinted Library-derivative plan and can create or refresh only `waveform-peaks.json` from each unambiguous canonical audio master; it cannot replace masters, rewrite metadata, change artwork/numbering, create private playback MP3s, or create HLS. Content revisions continue to begin from Ingest.
- Normal staging mechanics are informational rather than warnings: source audio is copied byte-for-byte without rewriting embedded metadata and canonical audio is stored as `audio-master.<original-extension>`. The guarded Staging Build also generates or refreshes `waveform-peaks.json` directly from each canonical audio master before the temporary release is promoted, so a newly built Library release is waveform-ready immediately. Private `audio-playback.mp3` and website HLS streams remain separate media-preparation jobs. Genuine warnings are reserved for conditions that need review.
- Document-style release and track overview
- Parsed TOML key/value tables
- Read-only raw TOML inspection
- Browser-local scalar draft editing
- Track-number-driven Library navigation and guarded artist_number_title directory synchronization
- Runtime media-location strip showing the configured Ingest, Staging, Library, and write-enabled Web Package roots; Live resolves its remote comparison target separately from deployment profiles
- Publish readiness uses a compact five-column overview with release-artwork thumbnails, separates canonical Sources from player-facing Web Package media, and gives each release one primary Ready Check entry point. After Ready Check, the page shows one plain-language result and one clearly labeled next action (`Resolve blockers`, `Prepare release`, `Prepare video media`, `Add to Web Package`, or `Update Web Package`); verbose issue, package-plan, contract, and fingerprint data stays collapsed by default. `Prepare release` generates audio HLS and any still-needed legacy/stale waveform maintenance plus durable browser artwork from canonical TIFF/TIF release art in the private Library; `Prepare video media` generates reviewed H.264/AAC HLS plus deterministic PNG poster frames for canonical videos. `Add to Web Package`/`Update Web Package` stages, validates, and atomically promotes the complete sanitized host-facing snapshot under `published-media/`. The publication manifest stores a stable content fingerprint so later Ready Check can report `Web Package is up to date` and suppress repeat no-op publishing until canonical metadata or public media changes; successful writes also surface through the shared transient success toast.
- Guarded release-title / release-directory synchronization with TOML-reference updates, staging-receipt updates, manifests, backups, collision detection, and rollback
- Staging Build generation/refresh of canonical Library waveform peaks, plus read-only private playback-MP3/waveform planning and reviewed playback-MP3/HLS (with legacy waveform maintenance fallback) from Publish
- In-memory multiband waveform generation for native PCM WAV sources, with FFmpeg decode-to-PCM support for other canonical audio formats

### Backend

- Node.js
- TypeScript
- Localhost-only HTTP API
- Confined media-root scanner
- TOML parsing and generation with `smol-toml`
- Atomic create-only writer
- Two-phase track-directory renaming with case-insensitive collision guards, operation manifests, metadata-reference updates, and rollback
- Dry-run-first release-directory renaming that updates `release.id`, `release.title`, `release_reference.release_id`, and `ingest-receipt.json` before the OS-level move
- SHA-256 post-write verification

## In-App Workflow Documentation

The five primary application tabs guide releases through the product workflow and make the private/local-public/remote-public boundaries explicit. The hamburger menus include a compact **Release workflow** summary, the metadata tag reference remains available outside the primary flow, and the footer links to a dedicated **Workflow & Help** page. The sticky footer's left side also presents a compact summary tailored to the active tab; this replaces the former in-page Ingest drop-summary table. The guide distinguishes currently available, partially available, and planned operations across:

```text
Ingest → Staging → Library → Web Package → Live
```

The maintained workflow content lives in:

```text
src/workflow-help-content.ts
```

Whenever the pipeline, lifecycle statuses, derivative-generation behavior, preflight rules, publishing model, or related UI changes, update that module, the rendered guide, and `tests/workflow-help.test.ts` in the same patch. Do not present planned write operations as available before their safety controls are implemented.

## Track Directory Number Synchronization

Library track ordering is driven by the saved disc and track numbers. For track directories using the established:

```text
artist_01_track-title
```

convention, changing the saved track number also plans a directory rename that preserves the artist and title segments. Metadata saves do not move directories. After numbering is saved, Library loads the server's exact dry-run plan, displays every rename or blocked item, and requires the confirmation phrase before applying the reviewed plan. The apply request includes the plan fingerprint, so a release change invalidates the review before any directory is moved. The filesystem API never replaces an existing target directory, compares names case-insensitively for typical macOS filesystems, writes an operation manifest before changing names, renames through unique temporary directories, updates `track.id` and `track_reference.track_id` in existing track TOMLs, synchronizes the current operational track IDs and destination paths in `ingest-receipt.json` while preserving historical `copyReceipts` and update records, backs that receipt up with the TOMLs, and rolls completed changes back when a later step fails. Custom directory IDs outside the numbered convention remain unchanged and require manual review. Releases whose track directories were renumbered before receipt synchronization existed can be repaired explicitly with `node --import tsx scripts/repair-ingest-receipt-track-paths.ts ../media-library <release-id>`; the dry run matches each historical receipt track to the current canonical Library track by the recorded audio-master byte size and SHA-256, refuses missing or duplicate-content matches, synchronizes the current receipt track ID, destination path, and authored track number, and then verifies every recorded current copy by path, size, and SHA-256 before the guarded apply is allowed. Historical `copyReceipts` and prior update records remain unchanged.

## Workflow Media Locations

The application reads its configured roots from the backend and exposes each path as hover details on its corresponding workflow tab:

```text
Ingest    → INGEST_ROOT (default ../ingest-drop)
Staging   → INGEST_OUTPUT_ROOT (default ../media-library)
Library   → MEDIA_LIBRARY_ROOT (default ../media-library)
Publish   → PUBLISHED_MEDIA_ROOT (default ../published-media; generated public snapshots)
```

Ingest inspection never modifies the source drop. After a reviewed create/update succeeds, the source candidate in `ingest-drop/` is disposable. A later revision can therefore arrive in a completely new ingest candidate: Staging resolves the existing release by release ID, preserves Library tracks and verified assets that are not represented in the new candidate, requires an explicit `Replace Track N` choice before revised source audio may supersede a canonical master, and also supports artwork-only revision candidates. New artwork can be assigned to release or existing-track destinations without resupplying the original audio; replacing occupied canonical front artwork requires explicit confirmation and preserves unrelated artwork/metadata. Staging creates or updates releases directly in the private canonical `media-library/`; Library authors that same long-term source of truth. Staging Build generates the canonical Library waveform from the audio master; Web Package Ready Check can prepare reproducible HLS web-stream derivatives, repair a missing/stale legacy waveform when necessary, and generate browser-compatible PNG artwork from canonical TIFF/TIF release art inside that private workspace after explicit review. Once those are current, Add to Web Package creates a sanitized player-facing snapshot in `published-media/` containing only host-ready HLS, waveform, browser artwork, and sanitized metadata while retaining the private canonical release and private playback derivatives. A later revision uses Update Web Package, which rebuilds the entire release snapshot instead of merging individual files so removed or renamed public assets cannot linger.


### Migrating the legacy `demo-media/` root

`demo-media/` was the proof-of-concept name for the private canonical Library. The production-facing default is now `media-library/`. Staging and Library intentionally point to the same root unless you explicitly override either environment variable. Existing installations should stop metadata-editor, rename the directory once, and then restart with both roots aligned. Do not copy only part of a release: prepared HLS streams, waveform data, TOMLs, artwork, receipts, and operation history all belong to the canonical release tree.

A later public-package build or update is always derived from this canonical Library. `published-media/` is generated output and must never become the source of truth.

## Release Identity and Directory Synchronization

Changing a public release title does not silently move its directory. From a Library release menu, **Release identity & directory** opens a server dry-run that can synchronize:

- `release.title`
- `release.id`
- every existing `release_reference.release_id`
- release-relative paths and identity fields in `ingest-receipt.json`
- the OS-level directory under `releases/`

The reviewed plan rejects blank or unsafe IDs, path traversal, symbolic links, stale content, and case-insensitive target collisions. Apply requires `RENAME_RELEASE_DIRECTORY`, creates an operation manifest and backups outside the release directory, performs a temporary-name move for case-only safety, and rolls metadata and directory changes back if a later step fails. Existing media bytes remain untouched.

## Media Root

The default private canonical media root is:

```text
../media-library
```

Override it with:

```text
MEDIA_LIBRARY_ROOT=../media-library
```

Relative paths are resolved from the `metadata-editor` project root.

Example `.env` values:

```env
INGEST_ROOT=../ingest-drop
INGEST_OUTPUT_ROOT=../media-library
MEDIA_LIBRARY_ROOT=../media-library
PUBLISHED_MEDIA_ROOT=../published-media
METADATA_EDITOR_PORT=4174
```

## Expected Media Structure

```text
releases/
└── 2026-07-30_release-title/
    ├── release.toml
    ├── release-settings.toml
    ├── release-production-notes.toml
    ├── artwork/
    │   └── front/
    │       └── artwork-master.jpeg
    └── tracks/
        └── artist-name_01_track-title/
            ├── track.toml
            ├── track-credits.toml
            ├── track-production-notes.toml
            └── audio-master.wav
```

Releases and tracks remain discoverable when one or more TOML files are absent.

Supported audio-master extensions currently include:

```text
.aac .aif .aiff .alac .flac .m4a .mp3 .ogg .opus .wav
```

Supported artwork-master extensions currently include:

```text
.avif .gif .jpeg .jpg .png .tif .tiff .webp
```

## Installation

```bash
cd ~/Desktop/record-label/metadata-editor;
npm install;
```

Optional macOS filesystem watching may require approving `fsevents`:

```bash
npm approve-scripts fsevents;
```

Vite may require approving `esbuild`:

```bash
npm approve-scripts esbuild;
```

## Development

Run the frontend and filesystem API in separate terminals.

### Terminal 1: Filesystem API

```bash
cd ~/Desktop/record-label/metadata-editor;
npm run dev:server;
```

### Terminal 2: Frontend

```bash
cd ~/Desktop/record-label/metadata-editor;
npm run dev;
```

Open:

```text
http://127.0.0.1:5174/
```

Health check:

```bash
curl --silent \
  http://127.0.0.1:4174/api/health \
  | python3 -m json.tool;
```

Expected response:

```json
{
  "status": "ok"
}
```

## Available Scripts

```bash
npm run dev
npm run dev:server
npm test
npm run build
npm run validate:library
npm run validate:release -- <release-id>
npm run publish:plan -- <release-id>
npm run preflight:publish -- <release-id>
npm run preview
```

## Validation

Development validation:

```bash
cd ~/Desktop/record-label/metadata-editor;

npm test;
npm run build;
git diff --check;
```

Canonical media-library validation is a separate, read-only operation:

```bash
npm run validate:library;
npm run validate:release -- 2008-10-24_yours;
```

The validator checks path confinement, symlinks, case-insensitive ID collisions,
release and track directory identity, TOML parsing, required documents and
fields, release/track references, numbering conflicts, master ambiguity,
referenced asset paths, derivative status, and ingest-receipt identity and
copy destinations. It never renames, rewrites, deletes, or repairs anything.

Use JSON output for automation or later Web Package Ready Check integration:

```bash
npm run validate:library -- --json;
npm run validate:release -- 2008-10-24_yours --json;
```

Receipt destinations are checked by path and recorded byte size by default.
Full SHA-256 verification is opt-in because it must read every recorded copied
file:

```bash
npm run validate:library -- --verify-hashes;
```

Exit codes are stable for shell use:

```text
0  validation completed without blocked issues (warnings may remain)
1  one or more blocked validation issues were found
2  validator configuration or execution failed
```

Validation is intentionally distinct from repair and publication. Publish
preflight now consumes the release-scoped validation report and adds the
player-facing package requirements without writing files:

```bash
npm run publish:plan -- 2008-10-24_yours;
npm run preflight:publish -- 2008-10-24_yours;
```

Use JSON output for automation or plan inspection:

```bash
npm run publish:plan -- 2008-10-24_yours --json;
```

The plan requires a current segmented HLS web stream and waveform derivative for every publishable track, selects one browser-compatible release artwork source, inspects existing public destinations, and lists every copied or generated path. It excludes audio masters, distribution/full-quality derivatives, private `audio-playback.mp3`, archival TIFF artwork, TOML source documents, ingest receipts, backups, production notes, and editor-only administration. `publish:plan`
reports the dry-run without writing; `preflight:publish` exits with status 1
when the plan is blocked so it can gate later automation.

HLS-stream/waveform/browser-artwork preparation is the first write-enabled Publish action and writes only reproducible derivatives inside the private canonical release. **Add to Web Package** is now the second write-enabled action: it reconstructs the exact reviewed sanitized package in an isolated sibling operation directory, verifies metadata/source fingerprints, copies only planned browser artwork, waveforms, and HLS files, generates `release.json`, per-track `track.json`, `publication-manifest.json`, and `catalog.json`, rejects unplanned/private files, verifies hashes, and atomically promotes the release and catalog. If the release is already public, the same guarded operation is labeled **Update Web Package** and backs up the previous release/catalog for rollback before replacement.

Published Media Fleet & Deployment Bundle v1 adds a whole-catalog deployment gate after release-scoped publication. The Web Package workspace verifies every directory under `published-media/releases/` against its `publication-manifest.json` and the root `catalog.json`, reports orphan directories or unexpected root files as blockers, and summarizes current, update-available, not-published, blocked, and preparation-needed Library releases. A verified tree can create `published-media/deployment-manifest.json`, which records the catalog hash, every manifest-controlled public file hash/size, each release publication-manifest identity, package-contract versions, and one snapshot content fingerprint. The deployment manifest intentionally excludes itself from that fingerprint. A missing or stale deployment manifest means the tree is not yet deployment-ready even when every individual release is valid.

Deployment commands:

```bash
npm run verify:published-media
npm run manifest:published-media
npm run stage:published-media -- --output ~/Desktop/metadata-editor-deploy --confirm STAGE_PUBLISHED_MEDIA
```

`verify:published-media` is read-only and exits non-zero for integrity blockers, an empty public tree, or a missing/stale deployment manifest. `manifest:published-media` writes only the deployment manifest after the complete public tree verifies. `stage:published-media` requires an explicit confirmation token, refuses to overwrite an existing target, requires a current deployment manifest, and copies only the verified sanitized snapshot into a new local directory. It does not SSH, rsync, configure nginx, or write to the public server.

Deployment Sync & Host Boundary v1 adds a guarded boundary between the verified local snapshot and a deployment destination. Deployment Profiles & Local Sandbox v1 keeps a safe local rehearsal target alongside the provisioned Hiplingo production boundary. Local Sandbox Lifecycle v1 lets the Live workspace execute the already-reviewed local-sandbox plan and restore its immediately previous verified snapshot from the browser; these write endpoints are hard-restricted to the `local-sandbox` profile with a `local:` filesystem target. Production and SSH deployment/rollback remain CLI-only. The default profile is `local-sandbox`, which mirrors the Hiplingo public-media location at `~/Desktop/websites/_deploy/hiplingo.com/published-media`. The `production` profile now defaults to `ssh:hiplingo-prod:/var/www/hiplingo.com/published-media`; the local SSH alias owns the remote user, host address, key, and connection details, so metadata-editor stores no server credentials. `PUBLISHED_MEDIA_PRODUCTION_TARGET` can intentionally override that alias target, and `PUBLISHED_MEDIA_DEPLOY_TARGET` remains available as a one-off `custom` override. `PUBLISHED_MEDIA_DEPLOY_PROFILE` can select the default named profile for a server process or shell. SSH targets may optionally set `PUBLISHED_MEDIA_DEPLOY_SSH_PORT`. Deployment operation receipts live outside `published-media` and are isolated by profile under the sibling `<published-media>.deployments/<profile>/` directory unless `PUBLISHED_MEDIA_DEPLOY_STATE_ROOT` is explicitly configured.

The established Hiplingo host boundary keeps frontend and media lifecycles independent:

```text
Local frontend source:
  ~/Desktop/record-label/audio-player/

Server frontend releases:
  /var/www/hiplingo.com/app/releases/<timestamp>/
  /var/www/hiplingo.com/app/current -> releases/<active-timestamp>/

Persistent public media:
  /var/www/hiplingo.com/published-media/

nginx public-media route:
  /media/ -> /var/www/hiplingo.com/published-media/
```

A frontend deployment or rollback must therefore never erase or roll back the independently published media tree. The private `media-library/` is never a deployment input; only the sanitized, verified `published-media/` snapshot crosses this boundary.

Host sync commands:

```bash
# No SSH/server is required for the default local sandbox.
npm run plan:published-media-deploy -- --profile local-sandbox
npm run deploy:published-media -- --profile local-sandbox --plan-fingerprint <reviewed-fingerprint> --confirm DEPLOY_PUBLISHED_MEDIA
npm run rollback:published-media -- --profile local-sandbox --confirm ROLLBACK_PUBLISHED_MEDIA

# Production uses the already-provisioned hiplingo-prod SSH alias by default:
# Optional override only; the production profile already defaults to:
# ssh:hiplingo-prod:/var/www/hiplingo.com/published-media
export PUBLISHED_MEDIA_PRODUCTION_TARGET='ssh:alternate-alias:/var/www/hiplingo.com/published-media'
# export PUBLISHED_MEDIA_DEPLOY_SSH_PORT=22

npm run plan:published-media-deploy -- --profile production
npm run deploy:published-media -- --profile production --plan-fingerprint <reviewed-fingerprint> --confirm DEPLOY_PUBLISHED_MEDIA
npm run rollback:published-media -- --profile production --confirm ROLLBACK_PUBLISHED_MEDIA
```

`plan:published-media-deploy` requires a current local deployment manifest and performs a checksum-based read-only comparison, including add/update/remove detection. When the local sandbox does not yet exist, planning treats it as an empty destination without creating directories, so normal local development remains side-effect free until a confirmed deployment. The Live workspace exposes Local sandbox and Production profile controls, the current profile/target, the same read-only **Check Live** plan, and the reviewed profile-specific CLI command. Its main release list mirrors **Web Package → Included**; release-level differences stay visible there, while any remote release absent from the Included set is surfaced separately as **Leaving Live** with an explicit review warning before deployment. Deployment readiness now separates public-snapshot integrity from canonical Library freshness. If an already-included release is **Update available**, the snapshot can still be internally valid, but Live reports **Library changes pending** and blocks deployment by default. **Refresh Web Package** in Live and **Refresh deployment manifest** never publish those Library edits; run **Update Web Package** first. An intentional older-snapshot deployment requires an explicit UI override for the local sandbox or `--allow-pending-library-changes` from the CLI. Releases that have never been published remain intentionally absent from the deployment snapshot and do not block it. `deploy:published-media` rebuilds that plan and refuses a stale fingerprint, copies the verified snapshot into a unique sibling incoming directory, checksum-verifies the incoming tree, rechecks the local snapshot fingerprint, preserves the immediately previous deployed directory as one sibling backup, promotes the incoming directory, and verifies the promoted target again. `rollback:published-media` is separately confirmed and only uses the latest completed receipt for the selected profile. The milestone does not modify nginx, DNS, TLS, firewall rules, SSH hardening, the audio-player source, or server configuration. Those remain server-provisioning responsibilities.

## Core Workflows

### Performer-credit range copy

Saved release- or track-level performer name/role pairs can be copied to several track overrides through one reviewed operation. The destination selector supports an inclusive Start track and End track in the same disc/track order shown by Library navigation. A range can replace the current destination selection, add to it, or remove from it. The source track is excluded, existing credits are preserved, normalized name/role duplicates are skipped, and the server dry-run remains required before any `track-credits.toml` document is created or updated.

Performer, songwriter, composer, lyricist, arrangement, and technical-credit sort names default from the credited name in `Last, First` form and remain synchronized while that generated value is in use. A manually authored sort name remains authoritative. Release and track license fields default to `All rights reserved.` in newly generated metadata, and existing blank license fields expose the same overrideable default in Library.

### Samples, Interpolations, and Clearance

Track sample relationships are authored in **Artists, Performers & Writers → Samples & Interpolations** and stored in `track-credits.toml` under `track.samples`. Supported relationship types are sample, interpolation, musical quotation, lyrical quotation, and unknown sample source. Public liner-note wording remains editable because licensed wording may be supplied by a label, publisher, attorney, or clearance agreement. Source artists are not automatically added as performers, and source writers are not automatically copied into the current track's songwriting credits.

Private clearance administration is authored in **Label, Publishing & Copyright → Sample Clearance** and stored under `track.sample_clearances` with `editor_only = true`. Clearance records can track master-use and publishing approval independently, along with agreement references, territories, expiration dates, and internal notes. Sample relationships and clearances are track-specific and do not use blanket release inheritance.

### Library Scan

The scanner inspects:

```text
<media-root>/releases/
```

It returns release directories, track directories, expected metadata-file status, detected audio and artwork masters, and scanner warnings.

API:

```text
GET /api/library/scan
```

### Playback and Waveform Processing Plan

The media-processing planner remains read-only. It inspects each track's canonical audio source, private `audio-playback.mp3`, and `waveform-peaks.json` for Library/local-preview purposes. New and revised canonical audio now receives a current `waveform-peaks.json` inside the guarded Staging Build transaction before Library promotion. A reviewed **Prepare release** operation remains responsible for the private 320 kbps playback MP3, the HLS web stream, legacy/missing/stale waveform repair when required, and—when needed—a browser-compatible PNG derived from canonical TIFF/TIF release artwork with a private freshness sidecar. Web Package keeps those purposes separate: HLS + waveform are website prerequisites, while the private playback MP3 is an optional Library/share derivative and never blocks or enters the Web Package.

The active profiles are intentionally distinct:

```text
Private/local playback
  audio-playback.mp3   320 kbps MP3 (never copied into website package)

Hosted web stream
  stream/index.m3u8    HLS VOD, AAC-LC, 192 kbps stereo
  stream/init.mp4      fMP4 initialization segment
  stream/segment-*.m4s fMP4 media segments, ~3 second target

Waveform
  waveform-peaks.json  schema v2, 400 peaks/second, 1024-point Hann FFT
```

The stream playlist contains relative references only. This keeps the package portable across private object storage, CDNs, signed-cookie/signed-URL deployments, or a custom HTTP service. Browser-visible waveform timing remains continuous and independent from HLS segment boundaries.

The private 320 kbps `audio-playback.mp3` is a convenience derivative for Library preview and private sharing, not a commerce contract. A future store/download workflow should create an explicit download derivative/profile and authorize delivery independently rather than exposing either the canonical master or assuming the private preview MP3 is the product file.

API:

```text
GET /api/media-processing/plan?release=<release-id>
GET /api/media-processing/plan?release=<release-id>&track=<track-id>
GET /api/media-processing/plan?release=<release-id>&peaksPerSecond=400
```

Reviewed Publish preparation API:

```text
POST /api/publish/prepare
{ releaseId, planFingerprint, planGeneratedAt }
```

The GET response includes `writesEnabled: false`, profile hashes, per-track checks, and create/replace/block recommendations. Execution is deliberately separate from planning: `POST /api/publish/prepare` requires the exact reviewed publish-plan fingerprint and generation timestamp. The server rebuilds that preflight before writing, stages private playback MP3 files, HLS directories, and waveforms under `.metadata-editor-operations/`, validates each prepared output, checks the source/profile state again for staleness, backs up replacement targets, then atomically promotes the prepared set with post-promotion SHA-256 verification and rollback protection. HLS is generated directly from the canonical source with FFmpeg AAC-LC; the private 320 kbps MP3 remains in `media-library` and is explicitly excluded from the website package. Native supported WAV sources are analyzed in memory for waveform data; other canonical formats are decoded by FFmpeg to temporary PCM solely for waveform analysis.

### Hosted Audio-Player Package Contract

Publish contract v5 plans a host-ready audio/video layout without deployment-domain URLs:

```text
releases/<release-id>/
  release.json
  publication-manifest.json
  artwork/front/artwork.<browser-ext>
  tracks/<track-id>/
    track.json
    waveform-peaks.json
    stream/
      index.m3u8
      init.mp4
      segment-00001.m4s
      segment-00002.m4s
      ...
  videos/<video-id>/
    video.json
    stream/
      poster.png
      index.m3u8
      init.mp4
      segment-00001.m4s
      segment-00002.m4s
      ...
```

Track-facing metadata exposes logical relative resources such as `stream.href -> stream/index.m3u8` and `waveform.href -> waveform-peaks.json`. `release.json` exposes each public video through `videos[].href`, and each sanitized `video.json` contains player-facing identity/relationship metadata, optional descriptive production fields, a relative PNG poster resource, and a relative H.264/AAC HLS stream resource. The publication manifest records stable track/video identity, resource paths, generation profiles, and hashes. The website package must never contain canonical audio/video masters, distribution masters, full-quality downloads, private `stream-info.json` preparation sidecars, or the private 320 kbps playback MP3 unless a separate explicit download/commerce workflow is introduced later.

### Inferred Metadata Preview

The editor may infer only low-risk values such as release ID, release date, release title, track ID, artist name, track number, track title, and relative asset paths.

It does not aggressively guess legal names, rights owners, credits, genres, label names, publishing data, licenses, or identifiers.

API:

```text
GET /api/library/preview?release=<release-id>
```

### Generated TOML Preview

Generated TOML is rendered entirely in memory and parsed again before being marked valid.

API:

```text
GET /api/library/generated-preview?release=<release-id>
```

### Generation Plan

Each target file is classified as:

```text
create   target file is missing
blocked  target file already exists
```

Supported scopes:

```text
all
release
track
```

API:

```text
GET /api/library/generation-plan
```

### Creating Missing Metadata

Creation requires the exact confirmation phrase:

```text
CREATE_MISSING_METADATA
```

API:

```text
POST /api/library/create-missing-metadata
```

Example:

```bash
curl --silent \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "releaseId": "2026-07-30_this-ones-all-you",
    "scope": "all",
    "confirmation": "CREATE_MISSING_METADATA"
  }' \
  http://127.0.0.1:4174/api/library/create-missing-metadata \
  | python3 -m json.tool;
```

The endpoint rescans the release, regenerates and validates TOML, rebuilds the plan, creates only missing files, refuses overwrites, re-reads each created file, and returns SHA-256 verification receipts.

## Audio Preview

Release detail views provide per-track play/pause controls in the sidebar plus previous, play/pause, next, and volume controls above the metadata tabs. The release header displays only explicit release-scoped front artwork and never substitutes a track image. Sidebar rows show the effective artwork for every track when available: local track-level artwork is shown normally, while inherited release artwork is visually subdued and marked with a small `R`. Rows omit the repeated word `Track` and place the saved track number directly before the display title on one compact line; multi-disc releases use `disc.track` numbering. On desktop, the long release/track sidebar remains sticky with its own bounded scroll region, while metadata and credits use the page's native vertical scroll. The track list scrolls independently while it has room, then continued wheel or trackpad movement at its top or bottom edge hands off to the page so the release header, tabs, and footer remain reachable. Outside editable fields and open dialogs, Arrow Up and Arrow Down move through the sidebar's Release row and displayed track order. Keyboard navigation scrolls only the sidebar and only when the destination crosses its visible edge, avoiding whole-page jumps and unnecessary re-centering. The local API resolves tracks by release and track IDs, prefers `audio-playback.*`, and falls back to one unambiguous `audio-master.*`.

API:

```text
GET /api/library/audio-preview?release=<release-id>&track=<track-id>
```

MP3 sources are served directly with HTTP byte-range support. Other recognized formats are decoded by FFmpeg and streamed as a temporary 192 kbps stereo MP3 preview. This live transcode does not rewrite the archival source or create a derivative inside the media library. Recognized source extensions include AAC, AIFF, ALAC, APE, AU/SND, CAF, DFF/DSF, FLAC, M4A, MKA, MP3, Ogg/Vorbis, Opus, TTA, WAV/WAVE, WMA, and WavPack. Actual decode support depends on the installed FFmpeg build.

A generated `audio-playback.mp3` remains preferred for instant startup, byte-range seeking, and repeatable browser playback.

## Metadata Detail View

The release detail view displays actual parsed metadata from existing TOMLs.

Example flattened keys:

```text
release.id
release.title
release.dates.release
track.numbering.track_number
track.assets.audio_master
```

Each document provides:

- filename
- relative path
- parsed key/value rows
- value type
- blank-value indication
- expandable raw TOML

Supported browser-local draft editing currently includes strings, numbers, and booleans. Arrays and objects remain read-only.

No scalar edit save endpoint exists yet.

## TOML Rules

TOML integers must not contain leading zeroes.

Valid:

```toml
track_number = 4
```

Invalid:

```toml
track_number = 04
```

Arrays of strings require quoted, comma-separated values:

```toml
genres = ["rock", "pop"]
genres = ["rock"]
genres = []
```

## Safety Model

Implemented protections include:

- localhost-only binding
- configured media-root confinement
- path traversal rejection
- canonical-path comparison
- symlink escape protection for reads and writes
- TOML validation before creation
- create-only behavior
- no overwrite path
- exclusive temporary-file creation
- same-directory atomic publication
- explicit confirmation phrase
- request body size limit
- post-write TOML validation
- SHA-256 verification receipts
- no absolute filesystem paths in frontend detail responses

Existing metadata files are always classified as `blocked`.

## Current Limitations

Not yet implemented:

- Persisting edits to existing TOML files
- External-change detection for edits
- Timestamped backups before replacement
- Arrays and arrays-of-tables editing
- Metadata registry-driven forms
- Unknown-field preservation during edited saves
- Per-field validation definitions
- Audio metadata injection
- `ffprobe` inspection
- Embedded ID3, RIFF, Vorbis, or MP4 metadata
- Commerce or deployment workflows
- Authentication or remote access
- Multi-user coordination

## Planned Next Milestone

The next milestone is safe scalar-value persistence:

1. Re-read the target TOML immediately before saving.
2. Compare the current content hash with the browser's original hash.
3. Reject stale edits when an external change is detected.
4. Apply only submitted scalar-path changes.
5. Preserve unknown keys, tables, arrays, and untouched blank fields.
6. Validate the reconstructed TOML.
7. Create a timestamped backup.
8. Save through a temporary file and atomic replacement.
9. Re-read and verify the saved TOML.
10. Return a SHA-256 receipt.

## Long-Term Direction

Potential media kinds include:

```ts
type MediaKind =
  | "audio-release"
  | "audio-track"
  | "music-video"
  | "live-video"
  | "promotional-video"
  | "artwork"
  | "document";
```

Future distribution boundaries may include:

```text
public
commerce
internal
```

The broader platform may eventually support audio releases and tracks, artwork and photography, music videos and visualizers, live-performance and promotional video, documents and booklets, archival and production assets, public derivatives, protected commerce derivatives, and internal-only masters.

## Relationship to Audio Player

The metadata editor is intentionally separate from the public audio player.

The audio player must not expose administrative editing controls, internal metadata, absolute filesystem paths, or private production notes. The two projects may share compatible metadata definitions later, but they remain separate applications and repositories.

## License

No license has been selected yet.

### Artwork master preference

Scanner warnings and Library health validation are role-aware. One
`artwork/front/artwork-master.*` (or a legacy direct
`artwork/artwork-master.*`) is treated as the primary front candidate for a
release or track. Intentional supplemental role directories—including
`alternate/`, `back/`, `liner-notes/`, `disc/`, `thumbnail/`, and custom role
directories—may coexist without producing a duplicate-primary warning.

When multiple primary/front candidates compete for the same canonical role, the
condition remains visible as a non-blocking warning and one deterministic
candidate is suggested using this format order:

```text
.tif / .tiff → .png → .webp → .avif → .jpg / .jpeg → .gif
```

The selected suggestion is used consistently by metadata inference, gallery
fallbacks, and starter TOML generation. Other candidates remain untouched and
must never be deleted automatically.

Library artwork views and Staging source-artwork rows can display `.tif` and
`.tiff` masters through a read-only FFmpeg conversion streamed as PNG. The
conversion is held in memory and does not create a derivative or modify the
archival master or ingest source. Library keeps the original TIFF available
through **Open original**.

### Calendar date fields

Recognized full-date metadata fields use native calendar controls throughout the
application and continue to store ISO `YYYY-MM-DD` strings in TOML. Existing
partial legacy values remain preserved until they are deliberately replaced with
a complete date.

### Metadata evidence sidecars

Recognized FFmpeg `;FFMETADATA1` sidecars are first-class ingest evidence rather than opaque text-only copies. They may accompany a new release, be attached later, or be staged by themselves against an existing canonical Library release. The parser preserves raw tags, maps known aliases to canonical metadata-editor paths, pairs sidecars to audio/tracks by encoded audio filename and track hints, surfaces conflicts instead of silently choosing a winner, and preserves unknown keys for future mappings. Unambiguous paired identity/track values can seed a new Staging draft; existing Library metadata is compared non-destructively against canonical TOML values when available and is never silently overwritten. Preserving the original sidecar file under `notes/imported/` remains optional because parsed provenance is recorded in the ingest receipt.

### Web Package inclusion and guarded removal

Publication selectivity lives at the Web Package release boundary, not at the deployment transport layer. The Web Package workspace shows the exact public set directly: **Included** releases are eligible for the next Live deployment, while **Not included** releases remain private in Library. Already-built Included releases report **Current**. The batch-preparation checkbox column is hidden when no visible release needs private derivative preparation; when preparation work exists, a labeled **Prepare** column appears and only eligible releases receive checkboxes, keeping preparation selection visually separate from publication membership. A Library release enters `published-media` only through **Add to Web Package**; deployment then moves the complete verified Web Package snapshot as one coherent catalog. **Review removal** provides the inverse operation without deleting canonical Library content. It builds a read-only plan that fingerprints the complete Web Package release tree plus `catalog.json`, then a confirmed write moves the Web Package release into the operation backup, removes exactly one catalog membership, promotes the staged catalog, verifies that the release directory and catalog membership are absent, and journals the result through the existing interrupted-operation recovery model. `deployment-manifest.json` is intentionally left stale so the next Refresh Web Package / Refresh deployment manifest / Check Live sequence exposes the resulting removal before sandbox or production deployment.

If `catalog.json` contains an Included release that is not present in the current Library scan, Web Package reports it as an **Included release missing from Library** instead of deleting anything automatically. This keeps removal authority explicit even when a canonical release has been archived or removed from the active Library separately.

```bash
npm run plan:unpublish-release -- --release <release-id>
npm run unpublish:release -- --release <release-id> --plan-fingerprint <reviewed-fingerprint> --confirm UNPUBLISH_PUBLIC_RELEASE
```

`plan:unpublish-release` is read-only. The guarded removal command keeps its historical `unpublish` CLI name, but it removes only the sanitized Web Package release and its catalog entry; it never deletes `media-library` masters, TOML, receipts, or private derivatives. After removal, refresh the deployment manifest and use Check Live so the target exposes the corresponding release-level **Leaving Live** warning before any deployment.

- Library Waveform renders the same shared `MediaVisualizationSurface` as Hiplingo: fixed-center audible scrubbing, the 2–6400 px/s zoom ladder, transition past maximum waveform zoom into the 2048–128-sample oscilloscope, press-and-hold freeze inspection, cached per-track frames, and shared zoom chrome. metadata-editor continues to supply its private playback/master source and Library navigation.

- Waveform zoom chrome keeps `+` in the upper-right and `−` in the lower-right, without a persistent numeric magnification readout.

Both metadata-editor and Hiplingo now use the same `useMediaElementAnalyser` adapter for the persistent HTML audio element. Playback startup and first waveform activation initialize that shared graph before audible scrubbing, so Firefox does not require entering Oscilloscope first to reach the responsive seek path.

The persistent footer now supplies the same shared `PlaybackShellController` as Hiplingo, and its persistent HTML audio element uses shared `useMediaElementVolume()` state/gain behavior. Private Library source resolution and queue/navigation remain host-owned.

Persistent Library current-time, duration, and direct seek state now use the same shared `useMediaElementTimeline()` controller as Hiplingo. Source selection, queue advancement, loading/error state, and private preview routing remain metadata-editor-owned.

Persistent play/pause/loading state now comes from the same shared `useMediaElementPlaybackState()` controller used by Hiplingo. metadata-editor still owns private preview source loading, queue auto-advance, and media-event wiring.

The persistent Library player now uses the same shared `useMediaElementPlaybackEvents()` transitions for ordinary media events. Its private preview error messaging, source loading, and ended/queue auto-advance policy remain metadata-editor-owned.

Private preview source attachment now implements the same shared `MediaSourceAdapter<TSource>` contract as Hiplingo. metadata-editor still owns guarded private preview URLs, analyser-before-play startup, private decode/transcode errors, and queue auto-advance; no Library path becomes public through the shared contract.

Private preview attachment now also runs through shared `useMediaSourceSession()`, which owns persistent-element-to-adapter orchestration and the current attached media key. The adapter still contains metadata-editor's private direct-source operations, and private Library URL construction remains outside the shared package.

The persistent Library player now renders the same shared `PersistentMediaElement` used by Hiplingo instead of constructing a host-local `new Audio()` instance. metadata-editor still owns private preview URLs, queue advancement, and error policy; all shared media hooks observe the same package-owned persistent element reference.
