# Player Metadata Compatibility Tests

This test harness determines how embedded audio metadata is stored,
reported by FFprobe, and displayed by media-library applications.

The test targets are:

- VLC
- Apple Music on macOS
- Windows Media Player on Windows 11
- Windows Media Player Legacy

No player mapping should be added to the metadata registry until it has
been observed in a controlled test.

## Test design

Each isolated fixture contains one distinctive metadata value, such as:

- `APTEST_TITLE`
- `APTEST_ARTIST`
- `APTEST_ALBUM`
- `APTEST_COMPOSER`

This makes it possible to identify which player field displays a
particular embedded tag without relying on ambiguous real-world media.

The harness also generates one combined fixture per container so that
interactions among commonly used fields can be inspected.

## Containers

The initial matrix includes:

| Fixture family | Container | Metadata family |
|---|---|---|
| `mp3-id3` | MP3 | ID3 |
| `flac-vorbis` | FLAC | Vorbis comments |
| `m4a-mp4` | M4A | MP4 atoms |
| `wav-riff` | WAV | RIFF INFO or other WAV metadata recognized by FFmpeg |

A metadata value accepted by FFmpeg is not automatically considered
supported by the container or visible in a player. FFprobe output and
manual player observations must both be recorded.

## Generate fixtures

From the metadata-editor project root, run the fixture generator and
then the FFprobe summarizer.

The default output directory is:

`tmp/player-tag-tests/`

A different output directory may be supplied as the first argument to
both scripts.

## Generated output

The generated output contains:

- `fixture-manifest.csv`
- `ffprobe-tag-summary.csv`
- an `ffprobe/` directory containing JSON probe results
- a `fixtures/` directory containing the generated media

Fixture families are grouped under:

- `flac-vorbis`
- `m4a-mp4`
- `mp3-id3`
- `wav-riff`

## Manual test procedure

For each player and fixture:

1. Record the operating-system version.
2. Record the exact player version.
3. Import or open the fixture.
4. Record where the value appears.
5. Record the exact player-visible label.
6. Record the exact displayed value.
7. Note whether the value is truncated, normalized, hidden, or ignored.
8. Record the observation date.
9. Set `status` to `verified`, `not-visible`, `partial`, or `blocked`.

Do not infer a mapping from another player or container.

## Suggested display locations

Use consistent descriptions where possible:

- library list
- album view
- track details
- properties
- information dialog
- metadata editor
- file properties
- unknown

## Status values

- `not-tested`
- `verified`
- `partial`
- `not-visible`
- `blocked`
- `inconclusive`

## Registry workflow

After a result is verified, update the appropriate field in
`server/metadata-registry.ts`.

Player alias arrays contain player-visible labels, not FFmpeg
command-line keys.

Raw container identifiers remain under:

- `ffmpeg`
- `id3`
- `vorbis`
- `mp4`
- `riff`

## Limitations

FFmpeg's generic metadata keys are translated by each muxer. For
example, `-metadata title=...` may become an ID3 frame in MP3, a Vorbis
comment in FLAC, or an MP4 atom in M4A.

The same generic key may therefore produce different storage behavior
and different player-visible behavior in each container.

Comments and ratings may also be application-specific. Artwork,
lyrics, sort fields, classical-music fields, and custom tags should be
tested in later focused fixture sets.
