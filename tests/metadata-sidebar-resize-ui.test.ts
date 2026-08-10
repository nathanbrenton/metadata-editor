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

const helpSource = await readFile(
  new URL(
    "../src/workflow-help-content.ts",
    import.meta.url,
  ),
  "utf8",
);

test("makes the desktop metadata sidebar wider, resizable, and persistent", () => {
  assert.match(
    appSource,
    /metadata-editor\.library-sidebar-width-rem/,
  );
  assert.match(
    appSource,
    /DEFAULT_METADATA_SIDEBAR_WIDTH_REM = 20/,
  );
  assert.match(
    appSource,
    /className="metadata-sidebar-resize-handle"/,
  );
  assert.match(
    appSource,
    /role="separator"/,
  );
  assert.match(
    appSource,
    /onPointerDown=\{[\s\S]*?handleMetadataSidebarResizePointerDown/,
  );
  assert.match(
    appSource,
    /window\.localStorage\.setItem\(/,
  );
  assert.match(
    styleSource,
    /@media \(min-width: 48\.001rem\)[\s\S]*?var\(--metadata-sidebar-width, 20rem\)[\s\S]*?0\.6rem[\s\S]*?minmax\(0, 1fr\)/,
  );
  assert.match(
    styleSource,
    /\.metadata-sidebar-resize-handle[\s\S]*?cursor: col-resize;/,
  );
});

test("supports keyboard resizing and a default-width reset", () => {
  assert.match(
    appSource,
    /event\.key === "ArrowLeft"/,
  );
  assert.match(
    appSource,
    /event\.key === "ArrowRight"/,
  );
  assert.match(
    appSource,
    /event\.key === "Home"/,
  );
  assert.match(
    appSource,
    /onDoubleClick=\{resetMetadataSidebarWidth\}/,
  );
  assert.match(
    appSource,
    /aria-valuemin=\{MIN_METADATA_SIDEBAR_WIDTH_REM\}/,
  );
  assert.match(
    appSource,
    /aria-valuemax=\{MAX_METADATA_SIDEBAR_WIDTH_REM\}/,
  );
});

test("keeps the resize affordance desktop-only and documents it", () => {
  assert.match(
    styleSource,
    /\.metadata-sidebar-resize-handle \{[\s\S]*?display: none;/,
  );
  assert.match(
    helpSource,
    /drag the vertical divider to resize it/i,
  );
  assert.match(
    helpSource,
    /chosen width is remembered/i,
  );
});
