import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

function buttonSourcesMatching(pattern: RegExp): string[] {
  return [...appSource.matchAll(/<button[\s\S]*?<\/button>/g)]
    .map((match) => match[0])
    .filter((source) => pattern.test(source));
}

test("skips inline metadata help controls during Tab navigation", () => {
  const helpButtons = buttonSourcesMatching(
    /className="metadata-field-control"/,
  );

  assert.ok(helpButtons.length >= 1);

  for (const buttonSource of helpButtons) {
    assert.match(buttonSource, /tabIndex=\{-1\}/);
  }
});

test("skips inline metadata remove controls during Tab navigation", () => {
  const removeButtons = [
    ...buttonSourcesMatching(
      /className="metadata-field-remove-control"/,
    ),
    ...buttonSourcesMatching(
      /className="performer-remove-button"/,
    ),
  ];

  assert.ok(removeButtons.length >= 1);

  for (const buttonSource of removeButtons) {
    assert.match(buttonSource, /tabIndex=\{-1\}/);
  }
});

test("documents streamlined metadata Tab navigation", () => {
  assert.match(
    helpSource,
    /Tab and Shift\+Tab move through data-entry controls/,
  );
  assert.match(
    helpSource,
    /without stopping on the small inline help/,
  );
});
