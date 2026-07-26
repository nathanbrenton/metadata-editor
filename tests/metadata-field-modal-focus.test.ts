import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

function readModalSource() {
  const start = appSource.indexOf(
    "function MetadataFieldModal(",
  );
  const end = appSource.indexOf(
    "function MetadataActivityLogModal(",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return appSource.slice(start, end);
}

test("keeps modal focus stable while controlled fields update", () => {
  const modalSource = readModalSource();

  assert.match(
    modalSource,
    /const onCloseRef = useRef\(onClose\)/,
  );
  assert.match(
    modalSource,
    /onCloseRef\.current = onClose/,
  );
  assert.match(
    modalSource,
    /onCloseRef\.current\(\)/,
  );
  assert.match(
    modalSource,
    /closeButtonRef\.current\?\.focus\(\)[\s\S]*?\}, \[\]\);/,
  );
  assert.doesNotMatch(
    modalSource,
    /closeButtonRef\.current\?\.focus\(\)[\s\S]*?\}, \[onClose\]\);/,
  );
});
