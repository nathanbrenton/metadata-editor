import process from "node:process";

import {
  applyArtistFoundationMigration,
  planArtistFoundationMigration,
} from "../server/artist-migration.js";
import { resolveMediaRoot } from "../server/media-root.js";

const APPLY_CONFIRMATION = "MIGRATE_ARTISTS_V1";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmIndex = args.indexOf("--confirm");
const confirmation = confirmIndex >= 0 ? args[confirmIndex + 1] : undefined;

const mediaRoot = await resolveMediaRoot();
const plan = await planArtistFoundationMigration(mediaRoot);

console.log("===== ARTIST FOUNDATION MIGRATION PLAN =====");
for (const item of plan.items) {
  console.log(
    `${item.action.toUpperCase().padEnd(7)} ${item.kind.padEnd(7)} ${item.relativePath}`,
  );
  console.log(`        ${item.reason}`);
}
console.log();
console.log(
  `create=${plan.summary.createCount} update=${plan.summary.updateCount} current=${plan.summary.currentCount} blocked=${plan.summary.blockedCount}`,
);

if (!apply) {
  console.log();
  console.log("Read-only plan only. No files were changed.");
  process.exitCode = plan.summary.blockedCount > 0 ? 2 : 0;
} else if (confirmation !== APPLY_CONFIRMATION) {
  console.error();
  console.error(
    `Refusing write. Re-run with --apply --confirm ${APPLY_CONFIRMATION}`,
  );
  process.exitCode = 2;
} else if (plan.summary.blockedCount > 0) {
  console.error();
  console.error("Refusing write because the migration plan contains blocked items.");
  process.exitCode = 2;
} else {
  const result = await applyArtistFoundationMigration(mediaRoot);
  console.log();
  console.log("===== ARTIST FOUNDATION MIGRATION APPLIED =====");
  console.log(`artist records created=${result.createdArtists.length}`);
  console.log(`release references updated=${result.updatedReleases.length}`);
  for (const update of result.updatedReleases) {
    console.log(`backup ${update.releaseId}: ${update.backupRelativePath}`);
  }
}
