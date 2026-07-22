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
- Preview release tracks with sidebar play/pause buttons and a desktop transport bar
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
├── demo-media/
├── media-library/
└── deployment-output/
```

Repository boundaries:

- `metadata-editor/` is its own Git repository.
- `audio-player/` is a separate Git repository.
- `demo-media/` remains outside both application repositories.
- `media-library/` is private and must not be committed.
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
- Desktop-first workflow navigation: Ingest → Staging → Library → Publish
- Document-style release and track overview
- Parsed TOML key/value tables
- Read-only raw TOML inspection
- Browser-local scalar draft editing
- Read-only playback-MP3 and waveform processing plans
- In-memory multiband waveform generation for PCM WAV sources

### Backend

- Node.js
- TypeScript
- Localhost-only HTTP API
- Confined media-root scanner
- TOML parsing and generation with `smol-toml`
- Atomic create-only writer
- SHA-256 post-write verification

## In-App Workflow Documentation

The four primary application tabs guide releases through the product workflow. The hamburger menus include a compact **Release workflow** summary, the metadata tag reference remains available outside the primary flow, and the footer links to a dedicated **Workflow & Help** page. The sticky footer's left side also presents a compact summary tailored to the active tab; this replaces the former in-page Ingest drop-summary table. The guide distinguishes currently available, partially available, and planned operations across:

```text
Ingest → Staging → Library → Publish
```

The maintained workflow content lives in:

```text
src/workflow-help-content.ts
```

Whenever the pipeline, lifecycle statuses, derivative-generation behavior, preflight rules, publishing model, or related UI changes, update that module, the rendered guide, and `tests/workflow-help.test.ts` in the same patch. Do not present planned write operations as available before their safety controls are implemented.

## Media Root

The default development media root is:

```text
../demo-media
```

Override it with:

```text
MEDIA_LIBRARY_ROOT=../media-library
```

Relative paths are resolved from the `metadata-editor` project root.

Example `.env` values:

```env
MEDIA_LIBRARY_ROOT=../demo-media
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
npm run preview
```

## Validation

```bash
cd ~/Desktop/record-label/metadata-editor;

npm test;
npm run build;
git diff --check;
```

## Core Workflows

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

The first media-processing milestone is intentionally read-only. It inspects each track's audio master, `audio-playback.mp3`, and `waveform-peaks.json`, then reports whether each derivative is current, missing, stale, or blocked. It does not create, replace, or delete files.

The active profile preserves the audio-player conventions:

```text
audio-playback.mp3   320 kbps MP3 target
waveform-peaks.json  schema v2, 400 peaks/second, 1024-point Hann FFT
```

API:

```text
GET /api/media-processing/plan?release=<release-id>
GET /api/media-processing/plan?release=<release-id>&track=<track-id>
GET /api/media-processing/plan?release=<release-id>&peaksPerSecond=400
```

The response includes `writesEnabled: false`, a profile SHA-256, per-track checks, and create/replace/block recommendations for a future confirmed executor. Native PCM WAV waveform analysis is implemented in memory; non-WAV masters are planned as requiring FFmpeg decoding before analysis.

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

Release detail views provide per-track play/pause controls in the sidebar plus previous, play/pause, next, and volume controls above the metadata tabs. The local API resolves tracks by release and track IDs, prefers `audio-playback.*`, and falls back to one unambiguous `audio-master.*`.

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
