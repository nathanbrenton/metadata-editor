import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inspectIngestCandidate,
  scanIngestDrop,
  type IngestCommandRunner,
} from "../server/ingest-scanner.js";

const ffprobePayload = JSON.stringify({
  streams: [
    {
      codec_type: "audio",
      codec_name: "aac",
      codec_long_name: "AAC",
      sample_rate: "48000",
      channels: 2,
      channel_layout: "stereo",
      bit_rate: "256000",
      tags: {
        language: "eng",
      },
    },
  ],
  format: {
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    format_long_name: "QuickTime / MOV",
    duration: "60.5",
    bit_rate: "264000",
    tags: {
      title: "Embedded Afternoon",
      artist: "Example Artist",
    },
  },
});

const mediaInfoPayload = JSON.stringify({
  media: {
    track: [
      {
        "@type": "General",
        Format: "MPEG-4",
        Duration: "60.5",
      },
      {
        "@type": "Audio",
        Format: "AAC",
        SamplingRate: "48000",
        Channels: "2",
        BitRate: "256000",
      },
    ],
  },
});

const commandRunner: IngestCommandRunner = async (
  command,
  args,
) => {
  if (command === "ffprobe" && args[0] === "-version") {
    return {
      exitCode: 0,
      stdout: "ffprobe version test\n",
      stderr: "",
    };
  }

  if (command === "mediainfo" && args[0] === "--Version") {
    return {
      exitCode: 0,
      stdout: "MediaInfo Command line test\n",
      stderr: "",
    };
  }

  if (command === "ffprobe") {
    return {
      exitCode: 0,
      stdout: ffprobePayload,
      stderr: "",
    };
  }

  return {
    exitCode: 0,
    stdout: mediaInfoPayload,
    stderr: "",
  };
};

async function createIngestFixture(): Promise<string> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "ingest-scan-"),
  );
  await writeFile(path.join(root, ".DS_Store"), "ignored");
  await writeFile(
    path.join(root, "161123_Pixels_v0.mp3"),
    "audio",
  );
  const folder = path.join(
    root,
    "2016-07-26_CrazyEights_TravisBedroom_GuitarDrums",
  );
  await mkdir(folder);
  await writeFile(
    path.join(folder, "160726_afternoon-1.m4a"),
    "audio",
  );
  await writeFile(
    path.join(folder, "notes.txt"),
    "notes",
  );
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "ingest-link-outside-"),
  );
  await symlink(outside, path.join(root, "linked"));

  return realpath(root);
}

test("scans top-level folders and loose files while ignoring system files and symlinks", async () => {
  const root = await createIngestFixture();
  const result = await scanIngestDrop(
    root,
    "../ingest-drop",
    commandRunner,
  );

  assert.equal(result.candidateCount, 2);
  assert.equal(result.fileCount, 3);
  assert.deepEqual(
    result.candidates
      .map((candidate) => candidate.id)
      .sort(),
    [
      "161123_Pixels_v0.mp3",
      "2016-07-26_CrazyEights_TravisBedroom_GuitarDrums",
    ].sort(),
  );
  assert.equal(result.capabilities.ffprobe.available, true);
  assert.equal(result.capabilities.mediainfo.available, true);

  const folder = result.candidates.find(
    (candidate) => candidate.kind === "folder",
  );
  assert.ok(folder);
  assert.equal(folder.audioCount, 1);
  assert.equal(folder.textCount, 1);
  assert.deepEqual(folder.dateCandidates, ["2016-07-26"]);
});

test("inspects media with ffprobe and MediaInfo without exposing write actions", async () => {
  const root = await createIngestFixture();
  const result = await inspectIngestCandidate(
    root,
    "2016-07-26_CrazyEights_TravisBedroom_GuitarDrums",
    "../ingest-drop",
    commandRunner,
  );

  assert.equal(result.readOnly, true);
  assert.equal(result.files.length, 2);

  const audio = result.files.find(
    (file) => file.mediaKind === "audio",
  );
  assert.ok(audio);
  assert.equal(audio.detectedBy, "ffprobe");
  assert.equal(audio.technical.codec, "aac");
  assert.equal(audio.technical.sampleRateHz, 48000);
  assert.equal(audio.technical.channels, 2);
  assert.equal(audio.embeddedMetadata.title, "Embedded Afternoon");
  assert.equal(audio.embeddedMetadata.artist, "Example Artist");
  assert.equal(
    audio.evidence.some(
      (item) => item.field === "embedded.title",
    ),
    true,
  );

  const text = result.files.find(
    (file) => file.mediaKind === "text",
  );
  assert.ok(text);
  assert.equal(text.detectedBy, "extension");
});
