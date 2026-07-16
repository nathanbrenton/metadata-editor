# FFprobe Findings

These results describe what FFmpeg wrote and FFprobe read back.
They do not yet establish what any media-player application displays.

## Summary

- MP3/ID3 preserved all 12 isolated test fields.
- FLAC/Vorbis comments preserved all 12 isolated test fields.
- M4A/MP4 preserved 11 of 12; `encoded_by` was not preserved.
- WAV/RIFF preserved 9 of 12; `album_artist`, `disc_number`, and `composer` were not preserved.

## Preservation matrix

| Field | MP3/ID3 | FLAC/Vorbis | M4A/MP4 | WAV/RIFF |
|---|---:|---:|---:|---:|
| `title` | Yes | Yes | Yes | Yes |
| `artist` | Yes | Yes | Yes | Yes |
| `album` | Yes | Yes | Yes | Yes |
| `album_artist` | Yes | Yes | Yes | No |
| `genre` | Yes | Yes | Yes | Yes |
| `date` | Yes | Yes | Yes | Yes |
| `track_number` | Yes | Yes | Yes | Yes |
| `disc_number` | Yes | Yes | Yes | No |
| `composer` | Yes | Yes | Yes | No |
| `comment` | Yes | Yes | Yes | Yes |
| `copyright` | Yes | Yes | Yes | Yes |
| `encoded_by` | Yes | Yes | No | Yes |

## Important interpretation

A `No` result means the current FFmpeg muxer invocation did not produce a value that FFprobe read back under that fixture. It does not prove that the container format can never store the field.

Player aliases should remain unverified until the generated files are manually tested in VLC, Apple Music, Windows Media Player, and Windows Media Player Legacy.

The complete manual matrix contains one row per fixture and player. Rows whose values were not written by FFmpeg are marked `not-written-by-ffmpeg` so they are not mistaken for player failures.
