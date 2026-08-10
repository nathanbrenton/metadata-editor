import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptedArtworkMasterExtensions,
  acceptedAudioMasterExtensions,
  acceptedVideoMasterExtensions,
  canonicalMediaMasterBasenames,
  canonicalMetadataExtension,
  mediaMasterExtensionPolicy,
  metadataEvidenceCandidateExtensions,
  preferredArtworkMasterExtensions,
  preferredAudioMasterExtensions,
  preferredVideoMasterExtensions,
  recognizedMetadataSidecarExtensions,
} from "../shared/media-file-spec.js";

function assertPreferredAreAccepted(
  preferred: readonly string[],
  accepted: ReadonlySet<string>,
) {
  for (const extension of preferred) {
    assert.equal(accepted.has(extension), true, extension);
  }
}

test("preferred master formats remain a subset of accepted scanner formats", () => {
  assertPreferredAreAccepted(
    preferredArtworkMasterExtensions,
    acceptedArtworkMasterExtensions,
  );
  assertPreferredAreAccepted(
    preferredAudioMasterExtensions,
    acceptedAudioMasterExtensions,
  );
  assertPreferredAreAccepted(
    preferredVideoMasterExtensions,
    acceptedVideoMasterExtensions,
  );
});

test("formalizes the first happy-path role and naming decisions", () => {
  assert.equal(canonicalMetadataExtension, ".toml");
  assert.deepEqual(recognizedMetadataSidecarExtensions, [
    ".ffmeta",
    ".ffmetadata",
  ]);
  assert.deepEqual(metadataEvidenceCandidateExtensions, [
    ".json",
    ".txt",
  ]);
  assert.equal(
    canonicalMediaMasterBasenames["artwork-master"],
    "artwork-master",
  );
  assert.equal(
    canonicalMediaMasterBasenames["audio-master"],
    "audio-master",
  );
  assert.equal(
    canonicalMediaMasterBasenames["video-master"],
    "video-master",
  );
  assert.equal(
    mediaMasterExtensionPolicy,
    "preserve-source-container-extension",
  );
});

test("keeps compatibility-only examples out of the preferred set", () => {
  assert.equal(acceptedAudioMasterExtensions.has(".aac"), true);
  assert.equal(new Set<string>(preferredAudioMasterExtensions).has(".aac"), false);
  assert.equal(acceptedVideoMasterExtensions.has(".avi"), true);
  assert.equal(new Set<string>(preferredVideoMasterExtensions).has(".avi"), false);
});
