import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL(
    "../src/App.tsx",
    import.meta.url,
  ),
  "utf8",
);
const builderSource = readFileSync(
  new URL(
    "../src/IngestReleaseBuilder.tsx",
    import.meta.url,
  ),
  "utf8",
);
const serverSource = readFileSync(
  new URL(
    "../server/ingest-builder.ts",
    import.meta.url,
  ),
  "utf8",
);

test(
  "offers guided and quick-review staging workflows from candidate inspection",
  () => {
    assert.match(
      appSource,
      /Build staging release/,
    );
    assert.match(
      builderSource,
      /Guided setup/,
    );
    assert.match(
      builderSource,
      /Quick review/,
    );
    assert.match(
      builderSource,
      /Confirm release identity/,
    );
    assert.match(
      builderSource,
      /Track tags and file mapping/,
    );
    assert.match(
      builderSource,
      /Preview build plan/,
    );
  },
);

test(
  "requires explicit confirmation and exposes no source mutation operation",
  () => {
    assert.match(
      builderSource,
      /leave all ingest sources\s+unchanged/s,
    );
    assert.match(
      serverSource,
      /INGEST_BUILD_CONFIRMATION_PHRASE/,
    );
    assert.match(
      serverSource,
      /copyFile\(/,
    );
    assert.doesNotMatch(
      serverSource,
      /rename\(\s*copy\.sourcePath/,
    );
    assert.doesNotMatch(
      serverSource,
      /unlink\(\s*copy\.sourcePath/,
    );
  },
);

test(
  "uses recognized release types and keeps jam in production context",
  () => {
    const optionsMatch = builderSource.match(
      /const releaseTypeOptions = \[([\s\S]*?)\] as const;/,
    );

    assert.ok(optionsMatch);

    assert.match(
      optionsMatch[1],
      /"field recording"/,
    );

    assert.doesNotMatch(
      optionsMatch[1],
      /"jam"/,
    );

    assert.match(
      builderSource,
      /working-session context[\s\S]*jam[\s\S]*Production Notes/i,
    );
  },
);
