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

test("shows compact stored, inherited, and generated metadata provenance chips", () => {
  assert.match(
    appSource,
    /type MetadataProvenanceKind =[\s\S]*?"stored"[\s\S]*?"inherited"[\s\S]*?"generated"/,
  );
  assert.match(
    appSource,
    /data-provenance=\{kind\}/,
  );
  assert.match(
    appSource,
    /kind="stored"[\s\S]*?Stored in \$\{document\.filename\} at \$\{row\.path\}/,
  );
  assert.match(
    appSource,
    /kind="inherited"[\s\S]*?Inherited from/,
  );
  assert.match(
    appSource,
    /kind="generated"[\s\S]*?generatedNote/,
  );
});

test("styles ordinary stored provenance more quietly than exceptional provenance", () => {
  assert.match(
    styleSource,
    /\.metadata-provenance-chip\s*\{[\s\S]*?border-radius:\s*999px/,
  );
  assert.match(
    styleSource,
    /\.metadata-provenance-chip\.is-stored\s*\{[\s\S]*?opacity:\s*0\.62/,
  );
  assert.match(
    styleSource,
    /\.metadata-provenance-chip\.is-inherited\s*\{[\s\S]*?border-style:\s*dashed/,
  );
  assert.match(
    styleSource,
    /\.metadata-provenance-chip\.is-generated\s*\{/,
  );
});

test("documents what field-level provenance does and does not prove", () => {
  assert.match(
    helpSource,
    /Field-level provenance chips now distinguish values stored/i,
  );
  assert.match(
    helpSource,
    /does not claim whether the value originally came from a manual edit, filename inference, or embedded tag/i,
  );
});
