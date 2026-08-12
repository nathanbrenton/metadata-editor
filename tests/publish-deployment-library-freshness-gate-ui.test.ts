import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const deployCliSource = await readFile(
  new URL("../scripts/deploy-published-media.ts", import.meta.url),
  "utf8",
);
const helpViewSource = await readFile(
  new URL("../src/WorkflowHelpView.tsx", import.meta.url),
  "utf8",
);
const helpContentSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test(
  "Publish distinguishes verified public integrity from pending canonical Library changes",
  () => {
    assert.match(
      appSource,
      /Web Package ready/,
    );
    assert.match(
      appSource,
      /Library updates/,
    );
    assert.match(
      appSource,
      /Update Web Package/,
    );
    assert.match(
      appSource,
      /publicationState !== "not-published"/,
    );
  },
);

test(
  "local sandbox deployment requires an explicit override for pending published-release changes",
  () => {
    assert.match(
      appSource,
      /allowPendingLibraryDeployment/,
    );
    assert.match(
      appSource,
      /allowPendingLibraryChanges: allowPendingLibraryDeployment/,
    );
    assert.match(
      appSource,
      /Deploy the current public snapshot anyway/,
    );
    assert.match(
      serverSource,
      /fleet\.summary\.updateAvailableCount > 0/,
    );
    assert.match(
      serverSource,
      /allowPendingLibraryChanges/,
    );
  },
);

test(
  "CLI deployment also rejects pending published-release changes unless explicitly overridden",
  () => {
    assert.match(
      deployCliSource,
      /--allow-pending-library-changes/,
    );
    assert.match(
      deployCliSource,
      /buildPublishFleetSummary/,
    );
    assert.match(
      deployCliSource,
      /updateAvailableCount > 0/,
    );
  },
);

test(
  "Publishing Guide header button is removed and its guidance is folded into Workflow Help and FAQ",
  () => {
    assert.doesNotMatch(
      appSource,
      />\s*Publishing guide\s*<\/button>/,
    );
    assert.match(
      helpViewSource,
      /Where did the Publishing Guide button go\?/,
    );
    assert.match(
      helpViewSource,
      /What if the Library changed after a release was published\?/,
    );
    assert.match(
      helpContentSource,
      /former Publishing guide button was removed/,
    );
    assert.match(
      helpContentSource,
      /Why can a verified deployment snapshot still say Library changes pending\?/,
    );
  },
);
