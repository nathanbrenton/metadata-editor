import assert from "node:assert/strict";
import test from "node:test";

import {
  pairFfmetadataSidecars,
  parseFfmetadataSidecar,
  sidecarSuggestionValue,
} from "../shared/ffmetadata-sidecar.js";
import type { IngestFileInspection } from "../shared/ingest-types.js";

const sample = `;FFMETADATA1
DATE=2022-02-12
TALB=Jam
DISC=1/1
ARTIST=nobodies
ALBUMARTIST=nobodies
TRACK=4/5
GENRE=Progressive Pop
TITLE=Vamp
COMPOSER=Nathan B., Brice M., Jamie R.
LYRICIST=Jamie Rubel
LANGUAGE=English
PUBLISHER=Nathan Brenton
COPYRIGHT=℗ 2022 Nathan Brenton
USLT=scream my heart out. theres nothing worse. lonely
COMMENT=for location recording and production: nbrenton@gmail.com
COMMENTS=for location recording and production: nbrenton@gmail.com
COMM=comm for location recordings and production: nbrenton@gmail.com
TSS=n8 5.9.7
`;

test("parses FFmetadata into canonical evidence without discarding unknown tags", () => {
  const parsed = parseFfmetadataSidecar(
    sample,
    "nobodies_2022-02-12_04-Revamp.wav.Metadata-Edited.txt",
  );

  assert.ok(parsed);
  assert.equal(parsed.audioFilenameHint, "nobodies_2022-02-12_04-Revamp.wav");
  assert.equal(sidecarSuggestionValue(parsed, "release.title"), "Jam");
  assert.equal(sidecarSuggestionValue(parsed, "release.primary_artist.name"), "nobodies");
  assert.equal(sidecarSuggestionValue(parsed, "track.numbering.track_number"), 4);
  assert.equal(sidecarSuggestionValue(parsed, "track.numbering.track_total"), 5);
  assert.equal(sidecarSuggestionValue(parsed, "track.title"), "Vamp");
  assert.equal(
    sidecarSuggestionValue(parsed, "release.rights.phonographic_copyright"),
    "℗ 2022 Nathan Brenton",
  );
  assert.equal(sidecarSuggestionValue(parsed, "track.text.comment"), undefined);
  assert.ok(parsed.unmappedKeys.includes("TSS"));
});

test("pairs legacy Metadata-Edited sidecars with the matching audio source", () => {
  const sidecar = parseFfmetadataSidecar(
    sample,
    "nobodies_2022-02-12_04-Revamp.wav.Metadata-Edited.txt",
  );
  assert.ok(sidecar);

  const common = {
    sizeBytes: 1,
    modifiedAt: "2026-08-09T00:00:00.000Z",
    technical: {},
    embeddedMetadata: {},
    evidence: [],
    warnings: [],
  };

  const files: IngestFileInspection[] = [
    {
      ...common,
      relativePath: "candidate/nobodies_2022-02-12_04-Revamp.wav",
      filename: "nobodies_2022-02-12_04-Revamp.wav",
      extension: ".wav",
      mediaKind: "audio",
      detectedBy: "extension",
    },
    {
      ...common,
      relativePath: "candidate/nobodies_2022-02-12_04-Revamp.wav.Metadata-Edited.txt",
      filename: "nobodies_2022-02-12_04-Revamp.wav.Metadata-Edited.txt",
      extension: ".txt",
      mediaKind: "text",
      detectedBy: "FFmetadata sidecar",
      metadataSidecar: sidecar,
    },
  ];

  const paired = pairFfmetadataSidecars(files);
  assert.equal(
    paired[1].metadataSidecar?.pairedAudioRelativePath,
    "candidate/nobodies_2022-02-12_04-Revamp.wav",
  );
});

test("handles escaped physical newlines and does not promote section metadata", () => {
  const parsed = parseFfmetadataSidecar(
    `;FFMETADATA1\nTITLE=Global title\nCOMMENT=line one\\\nline two\n[STREAM]\nTITLE=Stream title\n`,
    "example.wav.ffmetadata",
  );

  assert.ok(parsed);
  assert.equal(sidecarSuggestionValue(parsed, "track.title"), "Global title");
  assert.equal(sidecarSuggestionValue(parsed, "track.text.comment"), "line one\nline two");
  assert.equal(parsed.entries.find((entry) => entry.section === "STREAM")?.value, "Stream title");
  assert.equal(
    parsed.suggestions.filter((item) => item.canonicalPath === "track.title").length,
    1,
  );
});

test("returns undefined for ordinary text files", () => {
  assert.equal(parseFfmetadataSidecar("hello world\n", "notes.txt"), undefined);
});
