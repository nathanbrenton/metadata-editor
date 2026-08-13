import assert from "node:assert/strict";
import test from "node:test";

import {
  isPrimaryArtworkMasterForOwner,
} from "../shared/artwork-role-path.js";

const release = "releases/2026-08-13_demo";
const track = `${release}/tracks/artist_01_demo`;

function artwork(relativePath: string) {
  return { relativePath };
}

test("classifies canonical and legacy front artwork as primary", () => {
  assert.equal(
    isPrimaryArtworkMasterForOwner(
      release,
      artwork(`${release}/artwork/front/artwork-master.png`),
    ),
    true,
  );
  assert.equal(
    isPrimaryArtworkMasterForOwner(
      release,
      artwork(`${release}/artwork/artwork-master.tif`),
    ),
    true,
  );
  assert.equal(
    isPrimaryArtworkMasterForOwner(
      track,
      artwork(`${track}/artwork/front/artwork-master.webp`),
    ),
    true,
  );
});

test("classifies intentional nested artwork roles as supplemental", () => {
  for (const rolePath of [
    "alternate/alternate-front-1",
    "back",
    "liner-notes",
    "disc",
    "thumbnail",
    "supplemental/custom-role",
  ]) {
    assert.equal(
      isPrimaryArtworkMasterForOwner(
        release,
        artwork(
          `${release}/artwork/${rolePath}/artwork-master.png`,
        ),
      ),
      false,
      rolePath,
    );
  }
});

test("keeps unexpected legacy paths conservative", () => {
  assert.equal(
    isPrimaryArtworkMasterForOwner(
      release,
      artwork(`${release}/legacy-artwork-master.png`),
    ),
    true,
  );
});
