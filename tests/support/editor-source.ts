import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * Many UI tests assert on the editor client's source text. The client used
 * to be one file (src/App.tsx); it is now App.tsx plus the modules under
 * src/app/. These helpers return the combined source so those assertions
 * keep describing "the editor client" rather than one particular file.
 *
 * Prefer behaviour tests for new work; use this only for existing
 * source-shape assertions.
 */
const sourceRoot = fileURLToPath(
  new URL("../../src/", import.meta.url),
);

/* Original declaration order, so order-sensitive patterns still hold. */
const appModuleOrder = [
  "app/types.ts",
  "app/foundation.tsx",
  "App.tsx",
  "app/MetadataCompatibilityView.tsx",
  "app/technical-audit.tsx",
  "app/StagingWorkspace.tsx",
  "app/PublishWorkspace.tsx",
  "app/ingest-views.tsx",
  "app/library-views.tsx",
  "app/ReleaseCard.tsx",
  "app/metadata-records.tsx",
  "app/metadata-field-guidance.tsx",
  "app/ReleaseMetadataDetailView.tsx",
  "app/release-display.tsx",
  "app/metadata-value-cells.tsx",
  "app/credit-record-editors.tsx",
  "app/MetadataDocumentTable.tsx",
  "app/library-panels.tsx",
];

export function listEditorAppSourceFiles(): string[] {
  const discovered = readdirSync(path.join(sourceRoot, "app"))
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => `app/${name}`)
    .sort();

  return [
    ...appModuleOrder.filter(
      (name) =>
        name === "App.tsx" || discovered.includes(name),
    ),
    ...discovered.filter(
      (name) => !appModuleOrder.includes(name),
    ),
  ];
}

export function readEditorAppSource(): string {
  return listEditorAppSourceFiles()
    .map((name) =>
      readFileSync(path.join(sourceRoot, name), "utf8"),
    )
    .join("\n");
}

/*
 * The client re-uses API types owned by server/ and shared/ modules
 * (see src/app/types.ts). Tests that assert on the shape of those types
 * read the client together with the modules it imports them from.
 */
export function readEditorAppSourceWithSharedTypes(): string {
  const typesSource = readFileSync(
    path.join(sourceRoot, "app/types.ts"),
    "utf8",
  );
  const sharedTypeFiles = [
    ...typesSource.matchAll(
      /from "(\.\.\/\.\.\/(?:server|shared)\/[^"]+)\.js"/g,
    ),
  ].map((match) =>
    path.resolve(sourceRoot, "app", `${match[1]}.ts`),
  );

  return [
    readEditorAppSource(),
    ...[...new Set(sharedTypeFiles)].map((file) =>
      readFileSync(file, "utf8"),
    ),
  ].join("\n");
}
