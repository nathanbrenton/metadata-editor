import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const packageSource = await readFile(
  new URL("../package.json", import.meta.url),
  "utf8",
);
const brandPackageSource = await readFile(
  new URL(
    "../../packages/brand/package.json",
    import.meta.url,
  ),
  "utf8",
);

test("metadata-editor consumes the canonical Hiplingo brand package", async () => {
  assert.match(
    packageSource,
    /"@hiplingo\/brand": "file:\.\.\/packages\/brand"/,
  );
  assert.match(
    appSource,
    /import \{ hiplingoLogoUrl \} from "@hiplingo\/brand"/,
  );
  assert.doesNotMatch(appSource, /\.\/assets\/hiplingo-logo\.png/);
  assert.match(brandPackageSource, /"name": "@hiplingo\/brand"/);
  assert.match(appSource, /className="hiplingo-artwork-fallback"/);
  assert.match(styleSource, /\.hiplingo-artwork-fallback/);

  await assert.rejects(
    access(
      new URL(
        "../src/assets/hiplingo-logo.png",
        import.meta.url,
      ),
    ),
  );
});
