import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const playerSource = await readFile(
  new URL(
    "../src/PersistentLibraryPlayer.tsx",
    import.meta.url,
  ),
  "utf8",
);
const adapterSource = await readFile(
  new URL(
    "../src/library-metadata-preview.ts",
    import.meta.url,
  ),
  "utf8",
);
const sharedViewerSource = await readFile(
  new URL(
    "../../packages/media-player/src/ListenerMetadataViewer.tsx",
    import.meta.url,
  ),
  "utf8",
);

const sharedViewerStyles = await readFile(
  new URL(
    "../../packages/media-player/src/listener-metadata-viewer.css",
    import.meta.url,
  ),
  "utf8",
);
const hostViewerStyles = await readFile(
  new URL(
    "../src/listener-metadata-viewer-host.css",
    import.meta.url,
  ),
  "utf8",
);
const hiplingoViewerSource = await readFile(
  new URL(
    "../../hiplingo.com/src/components/MetadataViewer.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("metadata-editor footer exposes the shared public-style current-track metadata preview", () => {
  assert.match(
    playerSource,
    /persistent-library-player__metadata-button/,
  );
  assert.match(
    playerSource,
    /Track information/,
  );
  assert.match(
    appSource,
    /openCurrentTrackMetadataPreview/,
  );
  assert.match(
    appSource,
    /<ListenerMetadataViewer/,
  );
  assert.match(
    appSource,
    /audiophileMode=\{false\}/,
  );
  assert.match(
    appSource,
    /developerMode=\{false\}/,
  );
  assert.match(
    adapterSource,
    /buildLibraryMetadataPreview/,
  );
  assert.match(
    adapterSource,
    /"track-credits\.toml"/,
  );
});

test("Hiplingo and metadata-editor consume one listener-facing metadata presentation", () => {
  assert.match(
    hiplingoViewerSource,
    /ListenerMetadataViewer/,
  );
  assert.match(
    hiplingoViewerSource,
    /@hiplingo\/media-player/,
  );

  assert.match(
    appSource,
    /@hiplingo\/media-player\/listener-metadata-viewer\.css/,
  );
  assert.match(
    appSource,
    /\.\/listener-metadata-viewer-host\.css/,
  );
  assert.match(
    sharedViewerStyles,
    /\.metadata-viewer__section\s*\{/,
  );
  assert.doesNotMatch(
    hostViewerStyles,
    /\.metadata-viewer__section\s*\{/,
  );
  assert.doesNotMatch(
    sharedViewerSource,
    /className="metadata-viewer__eyebrow"/,
    "the shared listener viewer should not render a visible Track metadata eyebrow",
  );
  assert.match(
    sharedViewerSource,
    /aria-label="Track metadata"/,
    "the shared dialog should retain its accessible Track metadata label",
  );
  assert.doesNotMatch(
    sharedViewerStyles,
    /\.metadata-viewer__eyebrow\b/,
    "popup presentation belongs in canonical shared CSS without the obsolete eyebrow",
  );
  assert.doesNotMatch(
    hostViewerStyles,
    /\.metadata-viewer__eyebrow\b/,
    "metadata-editor host CSS should not diverge from the shared popup presentation",
  );

  assert.match(
    sharedViewerSource,
    /label: "Overview"/,
  );
  assert.match(
    sharedViewerSource,
    /label: "Credits"/,
  );
  assert.match(
    sharedViewerSource,
    /label: "Track Info"/,
  );

  const groupOrder = [
    "Performers",
    "Production",
    "Arrangement",
    "Recording & Editing",
    "Mixing & Mastering",
    "Songwriting & Composition",
  ].map(
    (label) =>
      sharedViewerSource.indexOf(
        `label="${label}"`,
      ),
  );

  assert.ok(
    groupOrder.every(
      (index) => index >= 0,
    ),
  );

  assert.deepEqual(
    [...groupOrder].sort(
      (left, right) =>
        left - right,
    ),
    groupOrder,
  );

  assert.match(
    sharedViewerSource,
    /getReleaseCreditEntries\(releaseCredits\.performers\)/,
  );
  assert.match(
    sharedViewerSource,
    /getReleaseCreditEntries\(releaseCredits\.songwriters\)/,
  );
  assert.match(sharedViewerSource, /role: "Written By"/);
  assert.match(sharedViewerSource, /role: "Words By"/);
  assert.match(sharedViewerSource, /role: "Additional Composer"/);
});
