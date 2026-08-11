import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  preferredArtworkMasterExtensions,
  preferredAudioMasterExtensions,
} from "../shared/media-file-spec.js";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("uses one release-level file-spec badge across Staging, Library, and Publish", () => {
  assert.match(
    appSource,
    /function MediaFileSpecBadge\(/,
  );

  const staging = appSource.slice(
    appSource.indexOf("function StagingWorkspace"),
    appSource.indexOf("function assessPublishReadiness"),
  );
  assert.match(
    staging,
    /<MediaFileSpecBadge release=\{release\} \/>/,
  );

  const card = appSource.slice(
    appSource.indexOf("function ReleaseCard"),
    appSource.indexOf("function ReleaseMetadataView"),
  );
  assert.match(
    card,
    /<MediaFileSpecBadge release=\{release\} prefix \/>/,
  );

  const publish = appSource.slice(
    appSource.indexOf("function PublishWorkspace"),
    appSource.indexOf("type LibraryReleaseViewMode"),
  );
  assert.match(publish, /<span>File spec<\/span>/);
  assert.match(
    publish,
    /<MediaFileSpecBadge release=\{release\} \/>/,
  );
});

test("v2 preferred master policy favors lossless artwork and audio without rejecting source formats", () => {
  assert.deepEqual(
    [...preferredArtworkMasterExtensions],
    [".tif", ".tiff", ".png"],
  );
  assert.deepEqual(
    [...preferredAudioMasterExtensions],
    [".wav", ".flac", ".aif", ".aiff"],
  );
  assert.match(
    helpSource,
    /accepted source-preserving compatibility inputs/i,
  );
  assert.match(
    appSource,
    /mediaMasterPreferredFormatGuidance\[mediaRole\]/,
  );
});
