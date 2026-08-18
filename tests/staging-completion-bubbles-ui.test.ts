import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Staging adds actionable completion bubbles between Release and Tracks", () => {
  assert.match(
    appSource,
    /<th scope="col">Release<\/th>[\s\S]*?<th scope="col" className="staging-bubbles-column">Bubbles<\/th>[\s\S]*?<th scope="col" className="numeric">Tracks<\/th>/,
  );
  assert.match(appSource, /buildStagingCompletionReminders/);
  assert.match(appSource, /Album art/);
  assert.match(appSource, /Artist bio/);
  assert.match(appSource, /Artist photo/);
  assert.match(appSource, /defaultTrackOverviewFieldPaths/);
  assert.match(appSource, /buildMetadataReadiness/);
  assert.match(appSource, /data-reminder-key=\{reminder\.key\}/);
  assert.match(appSource, /event\.stopPropagation\(\)/);
});

test("Staging groups repeated track analysis gaps and loads release detail in the background", () => {
  assert.match(
    appSource,
    /\/api\/library\/release-detail\?\$\{query\.toString\(\)\}/,
  );
  assert.match(appSource, /track\.audio\.bpm/);
  assert.match(appSource, /track\.audio\.key/);
  assert.match(appSource, /track\.audio\.camelot_key/);
  assert.match(appSource, /track\.audio\.time_signature/);
  assert.match(appSource, /track\.audio\.tuning_hz/);
  assert.match(
    appSource,
    /\`\$\{compactLabel\} ×\$\{missingTrackIds\.length\}\`/,
  );
  assert.match(
    appSource,
    /\`\$\{fullLabel\} is missing on \$\{missingTrackIds\.length\} tracks\./,
    "compact row labels should retain the full field name in the reminder description",
  );
});

test("completion bubbles can enter metadata edit mode at the target field", () => {
  assert.match(appSource, /type MetadataEditorFocusTarget/);
  assert.match(appSource, /openReleaseMetadataAtTarget/);
  assert.match(appSource, /initialFocusTarget=\{/);
  assert.match(appSource, /setActiveDocumentGroup\(/);
  assert.match(appSource, /setActiveMetadataTab\(/);
  assert.match(appSource, /setEditMode\(true\)/);
  assert.match(
    appSource,
    /data-metadata-path=\{field\.tomlPath\}[\s\S]*?tabIndex=\{-1\}/,
  );
  assert.match(
    appSource,
    /\.metadata-default-field-add-button/,
  );
});

test("completion bubbles retain Metadata Editor's restrained gray admin treatment", () => {
  assert.match(
    styles,
    /\.staging-completion-bubble\s*\{[\s\S]*?background:\s*rgba\(42, 49, 55, 0\.72\)/,
  );
  assert.match(styles, /\.staging-completion-bubble\.is-asset/);
  assert.match(styles, /\.staging-completion-bubble\.is-metadata/);
  assert.match(
    styles,
    /\.metadata-table-row\[data-metadata-path\]:focus/,
  );
});
