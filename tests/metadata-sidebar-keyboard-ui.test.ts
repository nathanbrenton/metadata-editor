import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("supports Arrow Up and Arrow Down navigation across release and track rows", () => {
  assert.match(
    appSource,
    /getAdjacentMetadataSidebarId/,
  );
  assert.match(
    appSource,
    /event\.key !== "ArrowUp"/,
  );
  assert.match(
    appSource,
    /event\.key !== "ArrowDown"/,
  );
  assert.match(
    appSource,
    /\["release", \.\.\.trackIds\]/,
  );
  assert.match(
    appSource,
    /data-metadata-navigation-id="release"/,
  );
  assert.match(
    appSource,
    /data-metadata-navigation-id=\{trackId\}/,
  );
  assert.match(
    appSource,
    /getMetadataSidebarScrollTop/,
  );
  assert.match(
    appSource,
    /sidebar\.scrollTo\(\{/,
  );
  assert.doesNotMatch(
    appSource,
    /destination\?\.scrollIntoView/,
  );
});

test("does not steal arrow keys from editable fields or open dialogs", () => {
  assert.match(
    appSource,
    /input, textarea, select/,
  );
  assert.match(
    appSource,
    /\[contenteditable="true"\]/,
  );
  assert.match(
    appSource,
    /\[aria-modal="true"\], dialog\[open\]/,
  );
  assert.match(
    appSource,
    /interactiveTarget && !eventStartedInSidebar/,
  );
});
