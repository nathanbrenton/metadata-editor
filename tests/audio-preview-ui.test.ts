import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);

test("renders sidebar and desktop transport preview controls", () => {
  assert.match(
    appSource,
    /metadata-track-preview-button/,
  );
  assert.match(
    appSource,
    /audio-preview-transport/,
  );
  assert.match(
    appSource,
    /Audio preview volume/,
  );
  assert.match(
    appSource,
    /Previous playable track/,
  );
  assert.match(
    appSource,
    /Next playable track/,
  );
});

test("keeps preview controls desktop-oriented and independently styled", () => {
  assert.match(
    styleSource,
    /\.audio-preview-transport\s*\{/,
  );
  assert.match(
    styleSource,
    /grid-template-columns:/,
  );
  assert.match(
    styleSource,
    /\.metadata-document-nav-item\s*\{/,
  );
  assert.match(
    styleSource,
    /\.metadata-track-preview-button\s*\{/,
  );
});

test("serves direct MP3 ranges and FFmpeg-transcoded previews through one identifier route", () => {
  assert.match(
    serverSource,
    /\/api\/library\/audio-preview/,
  );
  assert.match(serverSource, /Accept-Ranges/);
  assert.match(serverSource, /Content-Range/);
  assert.match(
    serverSource,
    /selectTrackAudioPreview/,
  );
  assert.match(
    serverSource,
    /sendTranscodedAudioPreview/,
  );
  assert.match(
    serverSource,
    /X-Audio-Preview-Delivery/,
  );
  assert.match(
    serverSource,
    /buildAudioPreviewTranscodeArgs/,
  );
});
