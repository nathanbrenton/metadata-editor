#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." &&
  pwd
)"

OUTPUT_ROOT="${1:-$PROJECT_ROOT/tmp/player-tag-tests}"
FIXTURE_ROOT="$OUTPUT_ROOT/fixtures"
PROBE_ROOT="$OUTPUT_ROOT/ffprobe"
MANIFEST_PATH="$OUTPUT_ROOT/fixture-manifest.csv"

FFMPEG_BIN="${FFMPEG_BIN:-ffmpeg}"
FFPROBE_BIN="${FFPROBE_BIN:-ffprobe}"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$command_name" >&2
    exit 1
  fi
}

csv_escape() {
  local value="$1"

  value="${value//\"/\"\"}"
  printf '"%s"' "$value"
}

write_manifest_row() {
  local fixture_id="$1"
  local container="$2"
  local extension="$3"
  local metadata_field="$4"
  local ffmpeg_key="$5"
  local test_value="$6"
  local relative_path="$7"

  {
    csv_escape "$fixture_id"
    printf ','
    csv_escape "$container"
    printf ','
    csv_escape "$extension"
    printf ','
    csv_escape "$metadata_field"
    printf ','
    csv_escape "$ffmpeg_key"
    printf ','
    csv_escape "$test_value"
    printf ','
    csv_escape "$relative_path"
    printf '\n'
  } >> "$MANIFEST_PATH"
}

probe_fixture() {
  local fixture_path="$1"
  local fixture_id="$2"

  "$FFPROBE_BIN" \
    -v error \
    -show_format \
    -show_streams \
    -of json \
    "$fixture_path" \
    > "$PROBE_ROOT/$fixture_id.json"
}

create_audio_fixture() {
  local fixture_id="$1"
  local container="$2"
  local extension="$3"
  local codec="$4"
  local metadata_field="$5"
  local ffmpeg_key="$6"
  local test_value="$7"

  local container_directory="$FIXTURE_ROOT/$container"
  local fixture_path="$container_directory/$fixture_id.$extension"
  local relative_path="fixtures/$container/$fixture_id.$extension"

  mkdir -p "$container_directory"

  "$FFMPEG_BIN" \
    -hide_banner \
    -loglevel error \
    -y \
    -f lavfi \
    -i "sine=frequency=440:sample_rate=48000:duration=1" \
    -c:a "$codec" \
    -metadata "$ffmpeg_key=$test_value" \
    "$fixture_path"

  probe_fixture \
    "$fixture_path" \
    "$fixture_id"

  write_manifest_row \
    "$fixture_id" \
    "$container" \
    "$extension" \
    "$metadata_field" \
    "$ffmpeg_key" \
    "$test_value" \
    "$relative_path"
}

create_combined_fixture() {
  local fixture_id="$1"
  local container="$2"
  local extension="$3"
  local codec="$4"

  local container_directory="$FIXTURE_ROOT/$container"
  local fixture_path="$container_directory/$fixture_id.$extension"
  local relative_path="fixtures/$container/$fixture_id.$extension"

  mkdir -p "$container_directory"

  "$FFMPEG_BIN" \
    -hide_banner \
    -loglevel error \
    -y \
    -f lavfi \
    -i "sine=frequency=880:sample_rate=48000:duration=2" \
    -c:a "$codec" \
    -metadata "title=APTEST_TITLE" \
    -metadata "artist=APTEST_ARTIST" \
    -metadata "album=APTEST_ALBUM" \
    -metadata "album_artist=APTEST_ALBUM_ARTIST" \
    -metadata "genre=APTEST_GENRE" \
    -metadata "date=2026-07-16" \
    -metadata "track=4/12" \
    -metadata "disc=2/3" \
    -metadata "composer=APTEST_COMPOSER" \
    -metadata "comment=APTEST_COMMENT" \
    -metadata "copyright=APTEST_COPYRIGHT" \
    -metadata "encoded_by=APTEST_ENCODED_BY" \
    "$fixture_path"

  probe_fixture \
    "$fixture_path" \
    "$fixture_id"

  write_manifest_row \
    "$fixture_id" \
    "$container" \
    "$extension" \
    "combined" \
    "multiple" \
    "APTEST_COMBINED" \
    "$relative_path"
}

generate_container_fixtures() {
  local container="$1"
  local extension="$2"
  local codec="$3"

  local -a fields=(
    "title|title|APTEST_TITLE"
    "artist|artist|APTEST_ARTIST"
    "album|album|APTEST_ALBUM"
    "album_artist|album_artist|APTEST_ALBUM_ARTIST"
    "genre|genre|APTEST_GENRE"
    "date|date|2026-07-16"
    "track_number|track|4/12"
    "disc_number|disc|2/3"
    "composer|composer|APTEST_COMPOSER"
    "comment|comment|APTEST_COMMENT"
    "copyright|copyright|APTEST_COPYRIGHT"
    "encoded_by|encoded_by|APTEST_ENCODED_BY"
  )

  local definition
  local metadata_field
  local ffmpeg_key
  local test_value
  local fixture_id

  for definition in "${fields[@]}"; do
    IFS='|' read -r \
      metadata_field \
      ffmpeg_key \
      test_value \
      <<< "$definition"

    fixture_id="${container}_${metadata_field}"

    create_audio_fixture \
      "$fixture_id" \
      "$container" \
      "$extension" \
      "$codec" \
      "$metadata_field" \
      "$ffmpeg_key" \
      "$test_value"
  done

  create_combined_fixture \
    "${container}_combined" \
    "$container" \
    "$extension" \
    "$codec"
}

require_command "$FFMPEG_BIN"
require_command "$FFPROBE_BIN"

rm -rf "$OUTPUT_ROOT"

mkdir -p \
  "$FIXTURE_ROOT" \
  "$PROBE_ROOT"

cat > "$MANIFEST_PATH" <<'CSV'
"fixture_id","container","extension","metadata_field","ffmpeg_key","test_value","relative_path"
CSV

generate_container_fixtures \
  "mp3-id3" \
  "mp3" \
  "libmp3lame"

generate_container_fixtures \
  "flac-vorbis" \
  "flac" \
  "flac"

generate_container_fixtures \
  "m4a-mp4" \
  "m4a" \
  "aac"

generate_container_fixtures \
  "wav-riff" \
  "wav" \
  "pcm_s16le"

printf '\nPlayer metadata fixtures generated.\n'
printf 'Output:   %s\n' "$OUTPUT_ROOT"
printf 'Manifest: %s\n' "$MANIFEST_PATH"
printf 'Fixtures: %s\n' "$FIXTURE_ROOT"
printf 'Probes:   %s\n' "$PROBE_ROOT"
