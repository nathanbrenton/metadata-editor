import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("offers an inclusive track-range selector in the performer-copy dialog", () => {
  assert.match(appSource, /Inclusive track range/);
  assert.match(appSource, />Start track</);
  assert.match(appSource, />End track</);
  assert.match(appSource, /Replace selection/);
  assert.match(appSource, /Add to selection/);
  assert.match(appSource, /Remove from selection/);
  assert.match(appSource, /applyDestinationRange/);
});

test("keeps performer-copy range controls dense and desktop oriented", () => {
  assert.match(
    styleSource,
    /\.performer-copy-range-tools\s*\{[^}]*display:\s*grid/s,
  );
  assert.match(
    styleSource,
    /\.performer-copy-range-tools\s*\{[^}]*grid-template-columns:/s,
  );
});

test("renders destination tracks as a compact selectable table", () => {
  assert.match(
    appSource,
    /<table className="performer-copy-destination-table">/,
  );
  assert.match(appSource, /<th scope="col">Disc<\/th>/);
  assert.match(appSource, /<th scope="col">Track<\/th>/);
  assert.match(appSource, /<th scope="col">Title<\/th>/);
  assert.doesNotMatch(
    appSource,
    /performer-copy-destination-grid/,
  );
  assert.match(
    styleSource,
    /\.performer-copy-destination-table-wrap\s*\{[^}]*overflow:\s*auto/s,
  );
  assert.match(
    styleSource,
    /\.performer-copy-destination-table\s*\{[^}]*table-layout:\s*fixed/s,
  );
  assert.match(
    styleSource,
    /\.performer-copy-destination-table tbody tr\.selected/,
  );
});
