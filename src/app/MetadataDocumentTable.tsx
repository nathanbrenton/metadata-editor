import {
  Fragment,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  flattenMetadata,
  type FlattenedMetadataRow,
} from "../metadata-flattener.js";
import { sortArrangementCreditDisplayRecords } from "../arrangement-credit-role.js";
import { sortWritingCreditDisplayRecords } from "../writing-credit-role.js";
import type {
  SampleClearanceRecordDraft,
  SampleRelationshipRecordDraft,
} from "../sample-relationship.js";
import {
  buildMissingInheritedMetadataRows,
  findMetadataValueAcrossDocuments,
  isBlankMetadataValue,
  resolveInheritedReleaseValue,
} from "../release-inheritance.js";
import {
  getDefaultTrackOverviewFieldOrder,
  getMissingTrackOverviewFieldPresentation,
  isDefaultTrackIdentityFieldPath,
  isDefaultTrackOverviewFieldPath,
  shouldShowDefaultTrackOverviewFields,
} from "../default-track-overview-fields.js";
import { generateTrackSortTitle } from "../track-derived-metadata.js";
import { artistNamePathForSortNamePath } from "../artist-sort-name.js";
import { generateArtistSortName } from "../../shared/artist-sort-name.js";
import { isReleaseEditorialStoragePath } from "../../shared/editorial-profile.js";
import {
  creditNamePathForSortNamePath,
  generateCreditSortName,
} from "../credit-sort-name.js";
import {
  defaultLicenseValue,
  isLicenseMetadataPath,
} from "../../shared/rights-defaults.js";
import { findProductionContextField } from "../../shared/production-context.js";
import {
  isDefaultRightsFieldPath,
  shouldShowDefaultRightsFields,
} from "../default-rights-fields.js";
import {
  createTrackPerformerOverride,
  resolveEffectivePerformerRecords,
} from "../performer-inheritance.js";
import {
  filterPresentableMetadataRows,
  unmappedMetadataGroup,
} from "../metadata-presentation.js";
import { resolveEffectiveTrackLanguage } from "../lyrics-language.js";
import {
  ArrangementCreditRecordEditor,
  PerformerRecordEditor,
  TechnicalCreditRecordEditor,
  WritingCreditRecordEditor,
} from "./credit-record-editors.js";
import {
  type EditableMetadataValue,
  type MetadataDraft,
  type PerformerRecordDraft,
  type WritingCreditRecordDraft,
  buildDocumentDraftKey,
  findRegisteredMetadataField,
  getDocumentDraftChanges,
  groupPersonRoleDisplayRecords,
  isPerformerRecordPath,
  mergeInheritedArrangementCredits,
  mergeInheritedTechnicalCredits,
  mergeInheritedWritingCredits,
  metadataGroupOrder,
  metadataGroupRank,
  readArrangementCreditRecords,
  readDocumentDraftString,
  readPerformerRecords,
  readSampleClearanceRecords,
  readSampleRelationshipRecords,
  readTechnicalCreditRecords,
  readWritingCreditRecords,
} from "./metadata-records.js";
import {
  LazySampleClearanceRecordEditor,
  LazySampleRelationshipRecordEditor,
  formatMetadataValue,
} from "./foundation.js";
import {
  MetadataFieldControls,
  MetadataFieldLabel,
  MetadataFieldModal,
  MetadataFieldPairHelpModal,
  type MetadataFieldPairHelpProps,
  isRelatedMetadataTagPath,
  isTrackDiscNumberingPath,
  resolveMetadataRowGroup,
} from "./metadata-field-guidance.js";
import type {
  MetadataFieldDefinition,
  ParsedMetadataDocument,
  ReleaseMetadataTab,
} from "./types.js";
import {
  MetadataProvenanceChip,
  MetadataValueCell,
  type ReleaseContributorRecord,
  buildDocumentMetadataRegistry,
  engineeringContributorGroups,
  engineeringCreditSummaryGroup,
  getContributorFieldLabel,
  getInitialMetadataFieldValue,
  getReleaseContributorLeaf,
  getReleaseContributorRecordIndex,
  getTrackContributorRecordIndex,
  metadataRowMatchesTab,
  metadataStorageRoleForFilename,
} from "./metadata-value-cells.js";

function MetadataDocumentTable({
  document,
  releaseDocuments,
  editMode,
  canFinishEditing,
  onBeginEdit,
  onDoneEditing,
  draft,
  performerDraft,
  technicalCreditDraft,
  arrangementCreditDraft,
  writingCreditDraft,
  sampleRelationshipDraft,
  sampleClearanceDraft,
  onDraftValueChange,
  onPerformerDraftChange,
  onTechnicalCreditDraftChange,
  onArrangementCreditDraftChange,
  onWritingCreditDraftChange,
  onSampleRelationshipDraftChange,
  onSampleClearanceDraftChange,
  onCopyPerformerCredits,
  metadataRegistry,
  activeMetadataTab,
  saving,
  addingFields,
  removingFieldKey,
  onSave,
  onAddFields,
  onRemoveField,
}: {
  document: ParsedMetadataDocument;
  releaseDocuments: ParsedMetadataDocument[];
  editMode: boolean;
  canFinishEditing: boolean;
  onBeginEdit: () => void;
  onDoneEditing: () => void;
  draft: MetadataDraft;
  performerDraft:
    | PerformerRecordDraft[]
    | undefined;
  technicalCreditDraft:
    | PerformerRecordDraft[]
    | undefined;
  arrangementCreditDraft:
    | PerformerRecordDraft[]
    | undefined;
  writingCreditDraft:
    | WritingCreditRecordDraft[]
    | undefined;
  sampleRelationshipDraft:
    | SampleRelationshipRecordDraft[]
    | undefined;
  sampleClearanceDraft:
    | SampleClearanceRecordDraft[]
    | undefined;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
  onPerformerDraftChange: (
    records: PerformerRecordDraft[],
  ) => void;
  onTechnicalCreditDraftChange: (
    records: PerformerRecordDraft[],
  ) => void;
  onArrangementCreditDraftChange: (
    records: PerformerRecordDraft[],
  ) => void;
  onWritingCreditDraftChange: (
    records: WritingCreditRecordDraft[],
  ) => void;
  onSampleRelationshipDraftChange: (
    records: SampleRelationshipRecordDraft[],
  ) => void;
  onSampleClearanceDraftChange: (
    records: SampleClearanceRecordDraft[],
  ) => void;
  onCopyPerformerCredits: (
    records: PerformerRecordDraft[],
  ) => void;
  metadataRegistry: MetadataFieldDefinition[];
  activeMetadataTab: ReleaseMetadataTab;
  saving: boolean;
  addingFields: boolean;
  removingFieldKey: string | null;
  onSave: () => void;
  onAddFields: (
    document: ParsedMetadataDocument,
    fields: MetadataFieldDefinition[],
  ) => void;
  onRemoveField: (
    document: ParsedMetadataDocument,
    field: MetadataFieldDefinition,
  ) => void;
}) {
  const documentMetadataRegistry =
    buildDocumentMetadataRegistry(
      document,
      metadataRegistry,
    );
  const rows = filterPresentableMetadataRows(
    flattenMetadata(document.parsed),
    documentMetadataRegistry,
  );
  const [
    selectedMissingFieldPaths,
    setSelectedMissingFieldPaths,
  ] = useState<string[]>([]);
  const [
    pendingFieldRemoval,
    setPendingFieldRemoval,
  ] = useState<{
    field: MetadataFieldDefinition;
    row: FlattenedMetadataRow;
  } | null>(null);
  const [
    performerHelpOpen,
    setPerformerHelpOpen,
  ] = useState(false);
  const metadataSectionsRef =
    useRef<HTMLDivElement>(null);
  const pendingMetadataSectionViewport =
    useRef<{
      sectionId: string;
      viewportTop: number;
    } | null>(null);

  const findMetadataSection = (
    sectionId: string,
  ): HTMLDetailsElement | null => {
    const sections =
      metadataSectionsRef.current
        ?.querySelectorAll<HTMLDetailsElement>(
          "details[data-metadata-section]",
        );

    return sections
      ? Array.from(sections).find(
          (section) =>
            section.dataset.metadataSectionId ===
            sectionId,
        ) ?? null
      : null;
  };

  /*
   * Optional-field creation refreshes the canonical document. Preserve the
   * active disclosure's viewport position across both the loading render and
   * the refreshed-document render instead of relying on a fixed scroll value.
   */
  const preserveMetadataSectionViewport = (
    sectionId: string,
    action: () => void,
  ) => {
    const section =
      findMetadataSection(sectionId);

    if (section) {
      pendingMetadataSectionViewport.current = {
        sectionId,
        viewportTop:
          section.getBoundingClientRect().top,
      };
    }

    action();
  };

  useLayoutEffect(() => {
    const anchor =
      pendingMetadataSectionViewport.current;

    if (!anchor) {
      return;
    }

    const restoreViewport = () => {
      const section =
        findMetadataSection(
          anchor.sectionId,
        );

      if (!section) {
        return;
      }

      const offset =
        section.getBoundingClientRect().top -
        anchor.viewportTop;

      if (Math.abs(offset) > 0.5) {
        window.scrollBy({
          top: offset,
          left: 0,
          behavior: "auto",
        });
      }
    };

    restoreViewport();

    if (addingFields) {
      return;
    }

    const frame =
      window.requestAnimationFrame(() => {
        restoreViewport();
        pendingMetadataSectionViewport.current =
          null;
      });

    return () =>
      window.cancelAnimationFrame(frame);
  }, [addingFields, document.sha256]);

  /*
   * Each TOML document and category keeps an independent disclosure
   * map. The document path distinguishes Release from every Track,
   * while the active category keeps Overview separate from Artists,
   * Production, Raw TOML, and the other task-oriented views.
   */
  const metadataDisclosureStorageKey = [
    "metadata-editor",
    "metadata-section-state",
    "v2",
    activeMetadataTab,
  ].join(":");

  const readMetadataDisclosureState = (
    storageKey: string,
  ): Record<string, boolean> => {
    try {
      const storedValue =
        window.localStorage.getItem(
          storageKey,
        );

      if (!storedValue) {
        return {};
      }

      const parsedValue = JSON.parse(
        storedValue,
      ) as unknown;

      if (
        !parsedValue ||
        typeof parsedValue !== "object" ||
        Array.isArray(parsedValue)
      ) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsedValue).filter(
          (
            entry,
          ): entry is [string, boolean] =>
            typeof entry[1] === "boolean",
        ),
      );
    } catch {
      return {};
    }
  };

  const [
    metadataSectionOpenState,
    setMetadataSectionOpenState,
  ] = useState<Record<string, boolean>>(
    () =>
      readMetadataDisclosureState(
        metadataDisclosureStorageKey,
      ),
  );

  useEffect(() => {
    setMetadataSectionOpenState(
      readMetadataDisclosureState(
        metadataDisclosureStorageKey,
      ),
    );
  }, [metadataDisclosureStorageKey]);

  const storeMetadataDisclosureState = (
    nextState: Record<string, boolean>,
  ) => {
    try {
      window.localStorage.setItem(
        metadataDisclosureStorageKey,
        JSON.stringify(nextState),
      );
    } catch {
      /*
       * Disclosure controls remain functional when storage is blocked
       * or unavailable; only cross-view persistence is skipped.
       */
    }
  };

  const updateMetadataSectionState = (
    sectionId: string,
    open: boolean,
  ) => {
    setMetadataSectionOpenState(
      (currentState) => {
        if (
          currentState[sectionId] === open
        ) {
          return currentState;
        }

        const nextState = {
          ...currentState,
          [sectionId]: open,
        };

        storeMetadataDisclosureState(
          nextState,
        );

        return nextState;
      },
    );
  };

  const handleMetadataSectionToggle = (
    sectionId: string,
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => {
    updateMetadataSectionState(
      sectionId,
      event.currentTarget.open,
    );
  };

  const handleMetadataSectionClick = (
    event: React.MouseEvent<HTMLElement>,
  ) => {
    if (!event.altKey) {
      return;
    }

    event.preventDefault();

    const details =
      event.currentTarget.closest(
        "details",
      );

    if (!(details instanceof HTMLDetailsElement)) {
      return;
    }

    const shouldOpen = !details.open;
    const nextState = {
      ...metadataSectionOpenState,
    };

    metadataSectionsRef.current
      ?.querySelectorAll<HTMLDetailsElement>(
        "details[data-metadata-section]",
      )
      .forEach((section) => {
        const sectionId =
          section.dataset.metadataSectionId;

        if (sectionId) {
          nextState[sectionId] =
            shouldOpen;
        }
      });

    setMetadataSectionOpenState(
      nextState,
    );
    storeMetadataDisclosureState(
      nextState,
    );
  };

  const renderSectionEditButton = () => {
    if (editMode && !canFinishEditing) {
      // Dirty drafts keep the explicit Save/Discard controls in the status bar.
      return null;
    }

    return (
      <button
        type="button"
        className="metadata-section-edit-button"
        disabled={saving || addingFields}
        onClick={(event) => {
          // A nested button must not toggle its parent <details> disclosure.
          event.preventDefault();
          event.stopPropagation();

          if (editMode) {
            onDoneEditing();
            return;
          }

          onBeginEdit();
        }}
      >
        {editMode
          ? "Done editing"
          : "Edit metadata"}
      </button>
    );
  };

  const releaseLanguageValue =
    findMetadataValueAcrossDocuments(
      releaseDocuments,
      "release.language",
    );
  const effectiveTrackLanguage =
    document.scope === "track"
      ? resolveEffectiveTrackLanguage({
          trackLanguage:
            readDocumentDraftString(
              document,
              "track.language",
              draft,
            ),
          releaseLanguage:
            typeof releaseLanguageValue ===
            "string"
              ? releaseLanguageValue
              : "",
        }).value
      : "";

  const inheritedOnlyRows =
    buildMissingInheritedMetadataRows(
      document,
      releaseDocuments,
      documentMetadataRegistry,
      metadataStorageRoleForFilename(
        document.filename,
      ),
    );
  const inheritedOnlyPaths = new Set(
    inheritedOnlyRows.map(
      (row) => row.path,
    ),
  );

  const allGroupedRows = [
    ...rows.map(
      (row, sourceIndex) => {
        const fieldDefinition =
          findRegisteredMetadataField(
            documentMetadataRegistry,
            row.path,
          );

        return {
          row,
          fieldDefinition,
          group:
            resolveMetadataRowGroup(
              rows,
              row,
              fieldDefinition,
            ),
          sourceIndex,
          inheritedOnly: false,
        };
      },
    ),
    ...inheritedOnlyRows.map(
      (row, inheritedIndex) => {
        const fieldDefinition =
          findRegisteredMetadataField(
            documentMetadataRegistry,
            row.path,
          );

        return {
          row,
          fieldDefinition,
          group:
            resolveMetadataRowGroup(
              rows,
              row,
              fieldDefinition,
            ),
          sourceIndex:
            rows.length + inheritedIndex,
          inheritedOnly: true,
        };
      },
    ),
  ].filter(
    ({ row }) =>
      !isReleaseEditorialStoragePath(
        row.path,
      ),
  );

  const groupedRows =
    activeMetadataTab === "settings"
      ? allGroupedRows
      : allGroupedRows.filter(
          ({ row, group }) =>
            metadataRowMatchesTab(
              row.path,
              group,
              activeMetadataTab,
            ),
        );

  const existingPaths =
    new Set(
      rows.map((row) => row.path),
    );
  const allMissingCategoryFields =
    documentMetadataRegistry
      .filter(
        (field) =>
          field.scope === document.scope &&
          field.storageFileRole ===
            metadataStorageRoleForFilename(
              document.filename,
            ) &&
          !field.repeatable &&
          !field.tomlPath.includes("[]") &&
          !existingPaths.has(
            field.tomlPath,
          ) &&
          !inheritedOnlyPaths.has(
            field.tomlPath,
          ) &&
          metadataRowMatchesTab(
            field.tomlPath,
            field.presentation?.group ??
              "Developer / Advanced",
            activeMetadataTab,
          ),
      )
      .sort(
        (left, right) =>
          (
            left.presentation?.order ??
            Number.MAX_SAFE_INTEGER
          ) -
          (
            right.presentation?.order ??
            Number.MAX_SAFE_INTEGER
          ),
      );

  /*
   * Musical-analysis fields are important track metadata, so keep them
   * visible in Overview even before optional TOML paths have been created.
   */
  const showDefaultTrackOverviewFields =
    shouldShowDefaultTrackOverviewFields({
      scope: document.scope,
      filename: document.filename,
      activeTab: activeMetadataTab,
    });
  const defaultTrackOverviewMissingFields =
    showDefaultTrackOverviewFields
      ? allMissingCategoryFields.filter(
          (field) =>
            isDefaultTrackOverviewFieldPath(
              field.tomlPath,
            ),
        )
      : [];
  const defaultTrackIdentityMissingFields =
    showDefaultTrackOverviewFields
      ? allMissingCategoryFields.filter(
          (field) =>
            isDefaultTrackIdentityFieldPath(
              field.tomlPath,
            ),
        )
      : [];
  const defaultLyricsLanguageMissingFields =
    document.scope === "track" &&
    document.filename === "track.toml" &&
    activeMetadataTab === "lyrics"
      ? allMissingCategoryFields.filter(
          (field) =>
            field.tomlPath ===
              "track.text.lyrics_language",
        )
      : [];

  const showDefaultRightsFields =
    shouldShowDefaultRightsFields({
      scope: document.scope,
      filename: document.filename,
      activeTab: activeMetadataTab,
    });
  const defaultRightsMissingFields =
    showDefaultRightsFields
      ? allMissingCategoryFields.filter(
          (field) =>
            isDefaultRightsFieldPath(
              document.scope,
              field.tomlPath,
            ),
        )
      : [];

  const showDefaultProductionContextFields =
    activeMetadataTab === "recording" &&
    (
      document.filename ===
        "release-production-notes.toml" ||
      document.filename ===
        "track-production-notes.toml"
    );
  const defaultProductionContextMissingFields =
    showDefaultProductionContextFields
      ? allMissingCategoryFields.filter(
          (field) =>
            Boolean(
              findProductionContextField(
                field.tomlPath,
              ),
            ),
        )
      : [];

  const missingCategoryFields =
    allMissingCategoryFields.filter(
      (field) =>
        (
          !isDefaultTrackOverviewFieldPath(
            field.tomlPath,
          ) &&
          !isDefaultTrackIdentityFieldPath(
            field.tomlPath,
          ) &&
          field.tomlPath !==
            "track.text.lyrics_language" &&
          !(
            showDefaultRightsFields &&
            isDefaultRightsFieldPath(
              document.scope,
              field.tomlPath,
            )
          ) &&
          !(
            showDefaultProductionContextFields &&
            Boolean(
              findProductionContextField(
                field.tomlPath,
              ),
            )
          )
        ) ||
        (
          !showDefaultTrackOverviewFields &&
          activeMetadataTab !== "lyrics" &&
          !showDefaultRightsFields &&
          !showDefaultProductionContextFields
        ),
    );

  const supportsPerformerRecords =
    activeMetadataTab === "credits" &&
    (
      (
        document.scope === "track" &&
        document.filename ===
          "track-credits.toml"
      ) ||
      (
        document.scope === "release" &&
        document.filename ===
          "release.toml"
      )
    );
  const savedPerformerRecords =
    readPerformerRecords(document);
  const releasePerformerRecords =
    document.scope === "track"
      ? releaseDocuments.flatMap(
          (releaseDocument) =>
            releaseDocument.filename ===
              "release.toml"
              ? readPerformerRecords(
                  releaseDocument,
                )
              : [],
        )
      : [];
  const localPerformerRecords =
    performerDraft ??
    savedPerformerRecords;
  const effectivePerformerState =
    document.scope === "track"
      ? resolveEffectivePerformerRecords(
          releasePerformerRecords,
          localPerformerRecords,
        )
      : {
          mode: "track" as const,
          effective:
            localPerformerRecords,
        };
  const performerRecords =
    effectivePerformerState.effective;
  const performersInheritedFromRelease =
    document.scope === "track" &&
    effectivePerformerState.mode ===
      "release" &&
    releasePerformerRecords.length > 0;
  const performerBasePath =
    document.scope === "release"
      ? "release.credits.performers"
      : "track.performers";
  const performerNameField =
    findRegisteredMetadataField(
      documentMetadataRegistry,
      `${performerBasePath}[0].name`,
    );
  const performerRoleField =
    findRegisteredMetadataField(
      documentMetadataRegistry,
      `${performerBasePath}[0].role`,
    );
  const performerHelpProps: MetadataFieldPairHelpProps = {
    title: document.scope === "release"
      ? "Release performers"
      : "Track performers",
    description:
      document.scope === "release"
        ? "Set the performer baseline for the release. Tracks inherit these paired name/role records until a track creates a local performer override."
        : "Track performers inherit the release baseline while the local performer array is empty. Customize the track to remove, edit, or add individual performers.",
    nameField: performerNameField,
    namePath: `${performerBasePath}[].name`,
    roleField: performerRoleField,
    rolePath: `${performerBasePath}[].role`,
    nameGuidance:
      "Enter the performer name exactly as supplied by the artist, liner notes, or release documentation.",
    roleGuidance:
      "Enter one performed role per record. Add another record with the same name when the performer has another instrument or vocal role.",
    nameExample: "Nathan Brenton",
    roleExample: "vocals",
    commonRoleValues:
      performerRoleField?.editor?.options ??
      performerRoleField?.presentation?.commonValues ??
      [],
  };
  const releasePrimaryArtistValue =
    findMetadataValueAcrossDocuments(
      releaseDocuments,
      "release.primary_artist.name",
    );
  const releasePrimaryArtistName =
    typeof releasePrimaryArtistValue ===
    "string"
      ? releasePrimaryArtistValue
      : "";
  const supportsTechnicalCreditRecords =
    activeMetadataTab === "recording" &&
    (
      (
        document.scope === "track" &&
        document.filename ===
          "track-credits.toml"
      ) ||
      (
        document.scope === "release" &&
        document.filename ===
          "release.toml"
      )
    );
  const supportsArrangementCreditRecords =
    activeMetadataTab === "credits" &&
    (
      (
        document.scope === "track" &&
        document.filename ===
          "track-credits.toml"
      ) ||
      (
        document.scope === "release" &&
        document.filename ===
          "release.toml"
      )
    );
  const supportsWritingCreditRecords =
    activeMetadataTab === "credits" &&
    (
      (
        document.scope === "track" &&
        document.filename === "track-credits.toml"
      ) ||
      (
        document.scope === "release" &&
        document.filename === "release.toml"
      )
    );
  const supportsSampleRelationshipRecords =
    activeMetadataTab === "credits" &&
    document.scope === "track" &&
    document.filename === "track-credits.toml";
  const supportsSampleClearanceRecords =
    activeMetadataTab === "rights" &&
    document.scope === "track" &&
    document.filename === "track-credits.toml";
  const technicalCreditRecords =
    technicalCreditDraft ??
    readTechnicalCreditRecords(
      document,
    );
  const releaseTechnicalCreditRecords =
    document.scope === "track"
      ? releaseDocuments.flatMap(
          (releaseDocument) =>
            releaseDocument.filename ===
            "release.toml"
              ? readTechnicalCreditRecords(
                  releaseDocument,
                )
              : [],
        )
      : [];
  const mergedTechnicalCredits =
    document.scope === "track"
      ? mergeInheritedTechnicalCredits(
          releaseTechnicalCreditRecords,
          technicalCreditRecords,
        )
      : {
          effective:
            technicalCreditRecords,
          inherited: [] as
            PerformerRecordDraft[],
        };
  const effectiveTechnicalCreditRecords =
    mergedTechnicalCredits.effective;
  const inheritedTechnicalCreditRecords =
    mergedTechnicalCredits.inherited;
  const releaseTechnicalContributorIndexes =
    new Set(
      document.scope === "release"
        ? technicalCreditRecords.flatMap(
            (record) =>
              record.sourceIndex === null
                ? []
                : [record.sourceIndex],
          )
        : [],
    );
  const arrangementCreditRecords =
    arrangementCreditDraft ??
    readArrangementCreditRecords(
      document,
    );
  const releaseArrangementCreditRecords =
    document.scope === "track"
      ? releaseDocuments.flatMap(
          (releaseDocument) =>
            releaseDocument.filename ===
            "release.toml"
              ? readArrangementCreditRecords(
                  releaseDocument,
                )
              : [],
        )
      : [];
  const mergedArrangementCredits =
    document.scope === "track"
      ? mergeInheritedArrangementCredits(
          releaseArrangementCreditRecords,
          arrangementCreditRecords,
        )
      : {
          effective:
            arrangementCreditRecords,
          inherited: [] as
            PerformerRecordDraft[],
        };
  const effectiveArrangementCreditRecords =
    mergedArrangementCredits.effective;
  const inheritedArrangementCreditRecords =
    mergedArrangementCredits.inherited;
  const releaseArrangementContributorIndexes =
    new Set(
      document.scope === "release"
        ? arrangementCreditRecords.flatMap(
            (record) =>
              record.sourceIndex === null
                ? []
                : [record.sourceIndex],
          )
        : [],
    );
  const writingCreditRecords =
    writingCreditDraft ??
    readWritingCreditRecords(document);
  const releaseWritingCreditRecords =
    document.scope === "track"
      ? releaseDocuments.flatMap((releaseDocument) =>
          releaseDocument.filename === "release.toml"
            ? readWritingCreditRecords(releaseDocument)
            : [],
        )
      : [];
  const mergedWritingCredits =
    document.scope === "track"
      ? mergeInheritedWritingCredits(
          releaseWritingCreditRecords,
          writingCreditRecords,
        )
      : {
          effective: writingCreditRecords,
          inherited: [] as WritingCreditRecordDraft[],
        };
  const effectiveWritingCreditRecords =
    mergedWritingCredits.effective;
  const inheritedWritingCreditRecords =
    mergedWritingCredits.inherited;
  const groupedWritingCredits =
    groupPersonRoleDisplayRecords(
      sortWritingCreditDisplayRecords(
        effectiveWritingCreditRecords.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
          family: record.family,
        })),
      ),
    );
  const sampleRelationshipRecords =
    sampleRelationshipDraft ??
    readSampleRelationshipRecords(document);
  const sampleClearanceRecords =
    sampleClearanceDraft ??
    readSampleClearanceRecords(document);
  const groupedPerformerRecords =
    groupPersonRoleDisplayRecords(
      performerRecords.map((record) => ({
        key: record.key,
        name: record.name,
        role: record.role,
        sortName: record.sortName,
      })),
    );

  const numberingRows =
    groupedRows
      .filter(
        ({ row }) =>
          isTrackDiscNumberingPath(
            row.path,
          ) &&
          row.path !==
            "track.identifiers.discogs_track_position",
      )
      .sort(
        (left, right) =>
          (left.fieldDefinition
            ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER) -
          (right.fieldDefinition
            ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER),
      );

  const relatedNumberingRows =
    groupedRows.filter(
      ({ row }) =>
        row.path ===
          "track.identifiers.discogs_track_position",
    );

  const findNumberingRow = (
    path: string,
  ) =>
    numberingRows.find(
      ({ row }) => row.path === path,
    );

  const trackNumberItem =
    findNumberingRow(
      "track.numbering.track_number",
    );
  const trackTotalItem =
    findNumberingRow(
      "track.numbering.track_total",
    ) ??
    findNumberingRow(
      "release.numbering.track_total",
    );
  const discNumberItem =
    findNumberingRow(
      "track.numbering.disc_number",
    );
  const discTotalItem =
    findNumberingRow(
      "track.numbering.disc_total",
    ) ??
    findNumberingRow(
      "release.numbering.disc_total",
    );

  const isReleaseNumbering =
    document.scope === "release";

  const numberingDisplayValue = (
    item:
      | (typeof numberingRows)[number]
      | undefined,
  ): EditableMetadataValue | "—" => {
    if (!item) {
      return "—";
    }

    const draftKey = buildDocumentDraftKey(
      document,
      item.row.path,
    );

    return draft[draftKey] ?? item.row.value;
  };

  const standardRows =
    groupedRows
      .filter(
        ({ row }) =>
          !isTrackDiscNumberingPath(
            row.path,
          ),
      )
      .sort((left, right) => {
        const groupDifference =
          (metadataGroupRank.get(
            left.group as
              typeof metadataGroupOrder[number],
          ) ??
            Number.MAX_SAFE_INTEGER) -
          (metadataGroupRank.get(
            right.group as
              typeof metadataGroupOrder[number],
          ) ??
            Number.MAX_SAFE_INTEGER);

        if (groupDifference !== 0) {
          return groupDifference;
        }

        const inferPathOrder = (
          path: string,
        ): number => {
          const preferredTrackOverviewOrder =
            new Map<string, number>([
              ["track.title", 10],
              ["track.version", 20],
              ["track.subtitle", 30],
              ["track.display_title", 40],
              ["track.sort_title", 45],
              ["track.explicit", 50],
              ["track.classification.genres", 100],
              ["track.classification.styles", 110],
              ["track.classification.moods", 120],
              ["track.classification.tags", 130],
              ["track.classification.instrumental", 200],
              ["track.classification.cover", 210],
              ["track.classification.live", 220],
              ["track.classification.remix", 230],
              ["track.classification.remaster", 240],
              ["track.identifiers.isrc", 300],
              ["track.identifiers.iswc", 310],
            ]);

          const preferredOrder =
            preferredTrackOverviewOrder.get(
              path,
            );

          if (preferredOrder !== undefined) {
            return preferredOrder;
          }

          if (
            /\.name$/.test(path)
          ) {
            return 10;
          }

          if (
            /\.sort_name$/.test(path)
          ) {
            return 20;
          }

          if (
            /\.(role|type|status)$/.test(
              path,
            )
          ) {
            return 30;
          }

          if (
            /\.(label|publisher|copyright|phonographic_copyright|license)/.test(
              path,
            )
          ) {
            return 40;
          }

          if (
            /\.(recorded_start|recorded_end|original_release|release|mixed|mastered|composed|arranged|remixed|remastered)$/.test(
              path,
            )
          ) {
            return 50;
          }

          return Number.MAX_SAFE_INTEGER;
        };

        const orderDifference =
          (left.fieldDefinition
            ?.presentation?.order ??
            inferPathOrder(
              left.row.path,
            )) -
          (right.fieldDefinition
            ?.presentation?.order ??
            inferPathOrder(
              right.row.path,
            ));

        return orderDifference !== 0
          ? orderDifference
          : left.sourceIndex -
              right.sourceIndex;
      })
      .map((item, index, items) => ({
        ...item,
        startsGroup:
          index === 0 ||
          item.group !==
            items[index - 1].group,
      })); 

  const groupedArrangementCredits =
    groupPersonRoleDisplayRecords(
      sortArrangementCreditDisplayRecords(
        effectiveArrangementCreditRecords.map(
          (record) => ({
            key: record.key,
            name: record.name,
            role: record.role,
            sortName: record.sortName,
          }),
        ),
      ),
    );

  const releaseContributorRecords =
    Array.from(
      standardRows.reduce<
        Map<number, ReleaseContributorRecord>
      >((records, item) => {
        const contributorIndex =
          getReleaseContributorRecordIndex(
            item.row.path,
          );

        if (
          contributorIndex === null ||
          releaseTechnicalContributorIndexes.has(
            contributorIndex,
          ) ||
          releaseArrangementContributorIndexes.has(
            contributorIndex,
          )
        ) {
          return records;
        }

        const existing =
          records.get(contributorIndex);

        if (existing) {
          existing.rows.push(item);
        } else {
          records.set(contributorIndex, {
            index: contributorIndex,
            rows: [item],
          });
        }

        return records;
      }, new Map()),
    )
      .map(([, record]) => record)
      .sort(
        (left, right) =>
          left.index - right.index,
      );

  const groupedEngineeringCredits =
    groupPersonRoleDisplayRecords(
      effectiveTechnicalCreditRecords.map(
        (record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        }),
      ),
    );

  const standardSections =
    standardRows.reduce<
      Array<{
        group: string;
        rows: Array<
          (typeof standardRows)[number]
        >;
      }>
    >((sections, item) => {
      const current =
        sections[sections.length - 1];

      if (
        !current ||
        current.group !== item.group
      ) {
        sections.push({
          group: item.group,
          rows: [item],
        });
      } else {
        current.rows.push(item);
      }

      return sections;
    }, []);

  const visibleStandardSections =
    standardSections
      .map((section) => ({
        ...section,
        rows: section.rows.filter(
          ({ row, group }) => {
            const trackContributorIndex =
              getTrackContributorRecordIndex(
                row.path,
              );
            const releaseContributorIndex =
              getReleaseContributorRecordIndex(
                row.path,
              );

            const isManagedTechnicalContributor =
              supportsTechnicalCreditRecords &&
              (
                (
                  trackContributorIndex !== null &&
                  engineeringContributorGroups.has(
                    group,
                  )
                ) ||
                (
                  releaseContributorIndex !== null &&
                  releaseTechnicalContributorIndexes.has(
                    releaseContributorIndex,
                  )
                )
              );
            const isManagedArrangementContributor =
              supportsArrangementCreditRecords &&
              (
                (
                  trackContributorIndex !== null &&
                  group ===
                    "Arrangement & Orchestration"
                ) ||
                (
                  releaseContributorIndex !== null &&
                  releaseArrangementContributorIndexes.has(
                    releaseContributorIndex,
                  )
                )
              );
            const isManagedWritingCredit =
              supportsWritingCreditRecords &&
              /^(track|release\.credits)\.(songwriters|composers|lyricists)\[\d+\]\./.test(
                row.path,
              );
            const isManagedSampleRelationship =
              supportsSampleRelationshipRecords &&
              /^track\.samples\[\d+\]\./.test(row.path);
            const isManagedSampleClearance =
              supportsSampleClearanceRecords &&
              /^track\.sample_clearances\[\d+\]\./.test(row.path);

            return !(
              isManagedTechnicalContributor ||
              isManagedArrangementContributor ||
              isManagedWritingCredit ||
              isManagedSampleRelationship ||
              isManagedSampleClearance
            );
          },
        ),
      }))
      .filter(
        (section) =>
          section.rows.length > 0,
      );

  let displayStandardSections =
    supportsPerformerRecords &&
    !visibleStandardSections.some(
      (section) =>
        section.group ===
          "Performers",
    )
      ? [
          ...visibleStandardSections,
          {
            group: "Performers",
            rows: [],
          },
        ]
      : visibleStandardSections;

  if (
    supportsWritingCreditRecords &&
    !displayStandardSections.some(
      (section) =>
        section.group === "Songwriting & Composition",
    )
  ) {
    const writingRank =
      metadataGroupRank.get(
        "Songwriting & Composition",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ?? Number.MAX_SAFE_INTEGER
          ) > writingRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group: "Songwriting & Composition",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (
    supportsSampleRelationshipRecords &&
    !displayStandardSections.some(
      (section) => section.group === "Samples & Interpolations",
    )
  ) {
    const sampleRank =
      metadataGroupRank.get("Samples & Interpolations") ??
      Number.MAX_SAFE_INTEGER;
    const insertionIndex = displayStandardSections.findIndex(
      (section) =>
        (metadataGroupRank.get(
          section.group as typeof metadataGroupOrder[number],
        ) ?? Number.MAX_SAFE_INTEGER) > sampleRank,
    );
    const index = insertionIndex >= 0
      ? insertionIndex
      : displayStandardSections.length;
    displayStandardSections = [
      ...displayStandardSections.slice(0, index),
      { group: "Samples & Interpolations", rows: [] },
      ...displayStandardSections.slice(index),
    ];
  }

  if (
    supportsSampleClearanceRecords &&
    !displayStandardSections.some(
      (section) => section.group === "Sample Clearance",
    )
  ) {
    const clearanceRank =
      metadataGroupRank.get("Sample Clearance") ??
      Number.MAX_SAFE_INTEGER;
    const insertionIndex = displayStandardSections.findIndex(
      (section) =>
        (metadataGroupRank.get(
          section.group as typeof metadataGroupOrder[number],
        ) ?? Number.MAX_SAFE_INTEGER) > clearanceRank,
    );
    const index = insertionIndex >= 0
      ? insertionIndex
      : displayStandardSections.length;
    displayStandardSections = [
      ...displayStandardSections.slice(0, index),
      { group: "Sample Clearance", rows: [] },
      ...displayStandardSections.slice(index),
    ];
  }

  if (
    supportsArrangementCreditRecords &&
    !displayStandardSections.some(
      (section) =>
        section.group ===
          "Arrangement & Orchestration",
    )
  ) {
    const arrangementRank =
      metadataGroupRank.get(
        "Arrangement & Orchestration",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ??
            Number.MAX_SAFE_INTEGER
          ) > arrangementRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group:
          "Arrangement & Orchestration",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (
    defaultTrackOverviewMissingFields.length >
      0 &&
    !displayStandardSections.some(
      (section) =>
        section.group ===
          "Musical Analysis",
    )
  ) {
    const musicalAnalysisRank =
      metadataGroupRank.get(
        "Musical Analysis",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ??
            Number.MAX_SAFE_INTEGER
          ) > musicalAnalysisRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group: "Musical Analysis",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (
    defaultLyricsLanguageMissingFields.length >
      0 &&
    !displayStandardSections.some(
      (section) =>
        section.group ===
          "Language & Writing System",
    )
  ) {
    const languageGroupRank =
      metadataGroupRank.get(
        "Language & Writing System",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ??
            Number.MAX_SAFE_INTEGER
          ) > languageGroupRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group: "Language & Writing System",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (defaultProductionContextMissingFields.length > 0) {
    for (const group of [
      "Production",
      "Recording",
      "Editing",
    ] as const) {
      const hasMissingGroupFields =
        defaultProductionContextMissingFields.some(
          (field) =>
            field.presentation?.group === group,
        );

      if (
        !hasMissingGroupFields ||
        displayStandardSections.some(
          (section) =>
            section.group === group,
        )
      ) {
        continue;
      }

      const groupRank =
        metadataGroupRank.get(group) ??
        Number.MAX_SAFE_INTEGER;
      const insertionIndex =
        displayStandardSections.findIndex(
          (section) =>
            (
              metadataGroupRank.get(
                section.group as
                  typeof metadataGroupOrder[number],
              ) ??
              Number.MAX_SAFE_INTEGER
            ) > groupRank,
        );
      const normalizedInsertionIndex =
        insertionIndex >= 0
          ? insertionIndex
          : displayStandardSections.length;

      displayStandardSections = [
        ...displayStandardSections.slice(
          0,
          normalizedInsertionIndex,
        ),
        {
          group,
          rows: [],
        },
        ...displayStandardSections.slice(
          normalizedInsertionIndex,
        ),
      ];
    }
  }

  if (
    defaultRightsMissingFields.length > 0 &&
    !displayStandardSections.some(
      (section) =>
        section.group ===
          "Music Business & Rights",
    )
  ) {
    const rightsRank =
      metadataGroupRank.get(
        "Music Business & Rights",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ??
            Number.MAX_SAFE_INTEGER
          ) > rightsRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group: "Music Business & Rights",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (
    supportsTechnicalCreditRecords
  ) {
    const summarySection = {
      group: engineeringCreditSummaryGroup,
      rows: [] as Array<
        (typeof standardRows)[number]
      >,
    };
    const technicalAudioIndex =
      displayStandardSections.findIndex(
        (section) =>
          section.group ===
            "Technical Audio",
      );
    const insertionIndex =
      technicalAudioIndex >= 0
        ? technicalAudioIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        insertionIndex,
      ),
      summarySection,
      ...displayStandardSections.slice(
        insertionIndex,
      ),
    ];
  }


  const renderMetadataRow = ({
    row,
    fieldDefinition,
    inheritedOnly,
  }: (typeof groupedRows)[number]) => {
    const inherited =
      resolveInheritedReleaseValue(
        document,
        row,
        releaseDocuments,
      );
    const artistNamePath =
      artistNamePathForSortNamePath(
        row.path,
      );
    const generatedArtistSortName =
      !inherited &&
      artistNamePath &&
      typeof row.value === "string" &&
      !row.value.trim()
        ? generateArtistSortName(
            readDocumentDraftString(
              document,
              artistNamePath,
              draft,
            ),
          ).value
        : "";
    const creditNamePath =
      creditNamePathForSortNamePath(
        row.path,
      );
    const generatedCreditSortName =
      !inherited &&
      creditNamePath &&
      typeof row.value === "string" &&
      !row.value.trim()
        ? generateCreditSortName(
            readDocumentDraftString(
              document,
              creditNamePath,
              draft,
            ),
          )
        : "";
    const generatedLicenseValue =
      !inherited &&
      isLicenseMetadataPath(row.path) &&
      typeof row.value === "string" &&
      !row.value.trim()
        ? defaultLicenseValue
        : "";

    return (
    <div
      key={row.path}
      className={[
        "metadata-table-row",
        /\[\d+\]/.test(row.path)
          ? "indexed-metadata-row"
          : "",
        editMode &&
        document.scope === "release" &&
        row.path === "release.description"
          ? "metadata-table-row--release-description-editor"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-metadata-path={row.path}
      tabIndex={-1}
    >
      <div className="metadata-key">
        <div className="metadata-key-heading">
          <strong>
            <MetadataFieldLabel
              label={
                fieldDefinition?.label
              }
              path={row.path}
            />
          </strong>

          <MetadataFieldControls
            field={fieldDefinition}
            path={row.path}
            valueType={row.valueType}
          />

          {editMode &&
            !inheritedOnly &&
            fieldDefinition &&
            !fieldDefinition.required &&
            fieldDefinition.tomlPath ===
              row.path &&
            !row.path.includes("[") &&
            [
              "string",
              "date",
              "number",
              "boolean",
              "string-array",
            ].includes(row.valueType) && (
              <button
                type="button"
                className="metadata-field-remove-control"
                tabIndex={-1}
                aria-label={`Remove ${fieldDefinition.label} field`}
                title={`Remove ${fieldDefinition.label} field`}
                disabled={
                  saving ||
                  addingFields ||
                  removingFieldKey !== null
                }
                onClick={() =>
                  setPendingFieldRemoval({
                    field: fieldDefinition,
                    row,
                  })
                }
              >
                {removingFieldKey ===
                buildDocumentDraftKey(
                  document,
                  fieldDefinition.tomlPath,
                )
                  ? "…"
                  : "×"}
              </button>
            )}
        </div>
      </div>

      {inheritedOnly && editMode &&
      inherited && fieldDefinition ? (
        <div className="metadata-inherited-override-field">
          <span className="metadata-value">
            <span>
              {formatMetadataValue(
                inherited.value,
              )}
            </span>
            <span className="metadata-value-provenance">
              <MetadataProvenanceChip
                kind="inherited"
                detail={`Inherited from ${inherited.sourcePath}`}
              />
            </span>
          </span>

          <button
            type="button"
            className="metadata-inherited-override-button"
            disabled={saving || addingFields}
            onClick={() =>
              onAddFields(
                document,
                [fieldDefinition],
              )
            }
          >
            {addingFields
              ? "Preparing override…"
              : "Create track override"}
          </button>
        </div>
      ) : (
        <MetadataValueCell
          document={document}
          row={row}
          field={fieldDefinition}
          inheritedValue={
            inherited?.value
          }
          inheritedSourcePath={
            inherited?.sourcePath
          }
          generatedFallbackValue={
            row.path ===
              "track.text.lyrics_language"
              ? effectiveTrackLanguage
              : generatedArtistSortName ||
                generatedCreditSortName ||
                generatedLicenseValue ||
                undefined
          }
          generatedFallbackNote={
            row.path ===
              "track.text.lyrics_language"
              ? "Generated from Track Language"
              : generatedArtistSortName
                ? "Generated from Artist Name"
                : generatedCreditSortName
                  ? "Generated from Credit Name"
                  : generatedLicenseValue
                    ? "Default rights reservation"
                    : undefined
          }
          editMode={editMode}
          draft={draft}
          onDraftValueChange={
            onDraftValueChange
          }
        />
      )}
    </div>
    );
  };

  const renderDefaultMissingField = (
    field: MetadataFieldDefinition,
  ) => {
    const initialValue =
      getInitialMetadataFieldValue(
        field,
        document,
        draft,
        releaseDocuments,
      );
    const generatedSortTitle =
      field.tomlPath === "track.sort_title"
        ? generateTrackSortTitle({
            title: readDocumentDraftString(
              document,
              "track.title",
              draft,
            ),
            version: readDocumentDraftString(
              document,
              "track.version",
              draft,
            ),
            displayTitle: readDocumentDraftString(
              document,
              "track.display_title",
              draft,
            ),
          })
        : null;
    const presentation =
      field.tomlPath === "track.sort_title"
        ? {
            generatedValue:
              generatedSortTitle?.value || null,
            generatedNote:
              generatedSortTitle?.source
                ? `Generated from ${generatedSortTitle.source}`
                : null,
            actionLabel: "Override Sort Title",
          }
        : field.tomlPath ===
            "track.text.lyrics_language"
          ? {
              generatedValue:
                effectiveTrackLanguage || null,
              generatedNote:
                effectiveTrackLanguage
                  ? "Generated from Track Language"
                  : null,
              actionLabel:
                effectiveTrackLanguage
                  ? "Override Lyrics Language"
                  : "Add Lyrics Language",
            }
          : isLicenseMetadataPath(field.tomlPath)
            ? {
                generatedValue: defaultLicenseValue,
                generatedNote:
                  "Default rights reservation",
                actionLabel: "Add default license",
              }
          : getMissingTrackOverviewFieldPresentation({
              path: field.tomlPath,
              label: field.label,
              initialValue,
            });

    return (
      <div
        key={field.tomlPath}
        className="metadata-table-row metadata-default-missing-row"
        data-metadata-path={field.tomlPath}
        tabIndex={-1}
      >
        <div className="metadata-key">
          <div className="metadata-key-heading">
            <strong>{field.label}</strong>

            <MetadataFieldControls
              field={field}
              path={field.tomlPath}
              valueType={field.valueType}
            />
          </div>
        </div>

        <div
          className={[
            "metadata-default-missing-value",
            presentation.generatedValue
              ? "has-derived-value"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {presentation.generatedValue && (
            <span className="metadata-value metadata-derived-default-value">
              <span>{presentation.generatedValue}</span>
              <span className="metadata-value-provenance">
                <MetadataProvenanceChip
                  kind="generated"
                  detail={
                    presentation.generatedNote ??
                    "Generated value"
                  }
                />
              </span>
            </span>
          )}

          {editMode ? (
            <button
              type="button"
              className="metadata-default-field-add-button"
              disabled={saving || addingFields}
              onClick={() =>
                preserveMetadataSectionViewport(
                  field.presentation?.group ??
                    "Musical Analysis",
                  () =>
                    onAddFields(
                      document,
                      [field],
                    ),
                )
              }
            >
              {addingFields
                ? "Adding field…"
                : presentation.actionLabel}
            </button>
          ) : !presentation.generatedValue ? (
            <span className="metadata-default-missing-placeholder">
              (not set)
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const renderSectionPrimaryRows = (
    section: (typeof displayStandardSections)[number],
  ) => {
    const existingRows =
      section.rows.filter(
        ({ row }) =>
          !isPerformerRecordPath(
            row.path,
          ) &&
          getReleaseContributorRecordIndex(
            row.path,
          ) === null &&
          !isRelatedMetadataTagPath(
            row.path,
          ),
      );

    if (
      ["Production", "Recording", "Editing"].includes(
        section.group,
      ) &&
      defaultProductionContextMissingFields.some(
        (field) =>
          field.presentation?.group ===
            section.group,
      )
    ) {
      const missingFields =
        defaultProductionContextMissingFields.filter(
          (field) =>
            field.presentation?.group ===
              section.group,
        );

      return [
        ...existingRows.map((item) => ({
          order:
            item.fieldDefinition
              ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER,
          sourceIndex: item.sourceIndex,
          content: renderMetadataRow(item),
        })),
        ...missingFields.map(
          (field, missingIndex) => ({
            order:
              field.presentation?.order ??
              Number.MAX_SAFE_INTEGER,
            sourceIndex:
              rows.length + missingIndex,
            content:
              renderDefaultMissingField(
                field,
              ),
          }),
        ),
      ]
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.sourceIndex -
              right.sourceIndex,
        )
        .map(({ content }) => content);
    }

    if (
      section.group ===
        "Music Business & Rights" &&
      defaultRightsMissingFields.length > 0
    ) {
      return [
        ...existingRows.map((item) => ({
          order:
            item.fieldDefinition
              ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER,
          sourceIndex: item.sourceIndex,
          content: renderMetadataRow(item),
        })),
        ...defaultRightsMissingFields.map(
          (field, missingIndex) => ({
            order:
              field.presentation?.order ??
              Number.MAX_SAFE_INTEGER,
            sourceIndex:
              rows.length + missingIndex,
            content:
              renderDefaultMissingField(
                field,
              ),
          }),
        ),
      ]
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.sourceIndex -
              right.sourceIndex,
        )
        .map(({ content }) => content);
    }

    if (
      section.group ===
        "Language & Writing System" &&
      defaultLyricsLanguageMissingFields.length >
        0
    ) {
      return [
        ...existingRows.map((item) => ({
          order:
            item.fieldDefinition
              ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER,
          sourceIndex: item.sourceIndex,
          content: renderMetadataRow(item),
        })),
        ...defaultLyricsLanguageMissingFields.map(
          (field, missingIndex) => ({
            order:
              field.presentation?.order ??
              Number.MAX_SAFE_INTEGER,
            sourceIndex:
              rows.length + missingIndex,
            content:
              renderDefaultMissingField(
                field,
              ),
          }),
        ),
      ]
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.sourceIndex -
              right.sourceIndex,
        )
        .map(({ content }) => content);
    }

    if (
      section.group !==
      "Musical Analysis"
    ) {
      return existingRows.map(
        renderMetadataRow,
      );
    }

    /*
     * Present and missing analysis fields share one ordered slot list. A
     * verified Add operation therefore replaces its synthetic row in place.
     */
    return [
      ...existingRows.map((item) => ({
        path: item.row.path,
        content: renderMetadataRow(item),
      })),
      ...defaultTrackOverviewMissingFields.map(
        (field) => ({
          path: field.tomlPath,
          content:
            renderDefaultMissingField(
              field,
            ),
        }),
      ),
    ]
      .sort(
        (left, right) =>
          getDefaultTrackOverviewFieldOrder(
            left.path,
          ) -
          getDefaultTrackOverviewFieldOrder(
            right.path,
          ),
      )
      .map(({ content }) => content);
  };

  const documentChangeCount =
    getDocumentDraftChanges(
      document,
      draft,
    ).length +
    (performerDraft !== undefined
      ? 1
      : 0) +
    (technicalCreditDraft !==
      undefined
      ? 1
      : 0) +
    (arrangementCreditDraft !==
      undefined
      ? 1
      : 0) +
    (writingCreditDraft !== undefined
      ? 1
      : 0) +
    (sampleRelationshipDraft !== undefined
      ? 1
      : 0) +
    (sampleClearanceDraft !== undefined
      ? 1
      : 0);

  const isSettingsDocument =
    /settings/i.test(document.filename);

  if (
    activeMetadataTab === "settings" &&
    !isSettingsDocument
  ) {
    return null;
  }

  if (
    activeMetadataTab !== "raw" &&
    groupedRows.length === 0 &&
    defaultTrackOverviewMissingFields.length ===
      0 &&
    defaultTrackIdentityMissingFields.length ===
      0 &&
    defaultLyricsLanguageMissingFields.length ===
      0 &&
    !(
      editMode &&
      missingCategoryFields.length > 0
    ) &&
    !supportsPerformerRecords &&
    !supportsTechnicalCreditRecords &&
    !supportsArrangementCreditRecords &&
    !supportsWritingCreditRecords &&
    !supportsSampleRelationshipRecords &&
    !supportsSampleClearanceRecords
  ) {
    return null;
  }

  if (activeMetadataTab === "raw") {
    return (
      <article className="metadata-document-table raw-only-document">
        <header>
          <div>
            <h3>{document.filename}</h3>
            <code>{document.relativePath}</code>
          </div>
        </header>

        <pre className="raw-toml-panel">
          <code>{document.content}</code>
        </pre>
      </article>
    );
  }

  const hasIdentitySection =
    displayStandardSections.some(
      (section) =>
        section.group ===
        "Release & Track Identity",
    );
  const hasDatesSection =
    displayStandardSections.some(
      (section) =>
        section.group === "Dates",
    );

  const numberingSection =
    numberingRows.length > 0 ? (
          <details
            className="metadata-section metadata-numbering-group"
            data-metadata-section
            data-metadata-section-id="track-disc-numbering"
            open={
              metadataSectionOpenState[
                "track-disc-numbering"
              ] ?? true
            }
            onToggle={(event) =>
              handleMetadataSectionToggle(
                "track-disc-numbering",
                event,
              )
            }
          >
            <summary
              onClick={
                handleMetadataSectionClick
              }
            >
              <span
                className="metadata-section-triangle"
                aria-hidden="true"
              />

              <div>
                <div className="metadata-numbering-title">
                  <h4>
                    Track &amp; Disc Numbering
                  </h4>

                  <MetadataFieldControls
                    field={
                      trackNumberItem
                        ?.fieldDefinition ??
                      trackTotalItem
                        ?.fieldDefinition ??
                      discNumberItem
                        ?.fieldDefinition ??
                      discTotalItem
                        ?.fieldDefinition
                    }
                    path={
                      trackNumberItem?.row.path ??
                      trackTotalItem?.row.path ??
                      discNumberItem?.row.path ??
                      discTotalItem?.row.path ??
                      "track.numbering"
                    }
                    valueType={
                      trackNumberItem
                        ?.row.valueType ??
                      trackTotalItem
                        ?.row.valueType ??
                      discNumberItem
                        ?.row.valueType ??
                      discTotalItem
                        ?.row.valueType ??
                      "number"
                    }
                  />
                </div>

              </div>

              <span className="metadata-section-summary-actions">
                {!isReleaseNumbering && (
                  <span className="metadata-numbering-summary">
                    Track {String(
                      numberingDisplayValue(
                        trackNumberItem,
                      ),
                    )} of {String(
                      numberingDisplayValue(
                        trackTotalItem,
                      ),
                    )}
                    {" · "}
                    Disc {String(
                      numberingDisplayValue(
                        discNumberItem,
                      ),
                    )} of {String(
                      numberingDisplayValue(
                        discTotalItem,
                      ),
                    )}
                  </span>
                )}

                {renderSectionEditButton()}
              </span>
            </summary>

            <div className="metadata-numbering-pairs">
              <div className="metadata-numbering-pair">
                <div className="metadata-numbering-pair-label">
                  <strong>
                    {isReleaseNumbering
                      ? "Tracks"
                      : "Track"}
                  </strong>

                </div>

                <div className="metadata-numbering-fraction">
                  {!isReleaseNumbering &&
                    trackNumberItem && (
                      <MetadataValueCell
                        document={document}
                        row={
                          trackNumberItem.row
                        }
                        editMode={editMode}
                        draft={draft}
                        onDraftValueChange={
                          onDraftValueChange
                        }
                      />
                    )}

                  {!isReleaseNumbering && (
                    <span
                      className="metadata-numbering-divider"
                      aria-hidden="true"
                    >
                      /
                    </span>
                  )}

                  {trackTotalItem && (
                    <MetadataValueCell
                      document={document}
                      row={trackTotalItem.row}
                      editMode={editMode}
                      draft={draft}
                      onDraftValueChange={
                        onDraftValueChange
                      }
                    />
                  )}

                  {isReleaseNumbering && (
                    <small>total</small>
                  )}
                </div>
              </div>

              <div className="metadata-numbering-pair">
                <div className="metadata-numbering-pair-label">
                  <strong>
                    {isReleaseNumbering
                      ? "Discs"
                      : "Disc"}
                  </strong>

                </div>

                <div className="metadata-numbering-fraction">
                  {!isReleaseNumbering &&
                    discNumberItem && (
                      <MetadataValueCell
                        document={document}
                        row={discNumberItem.row}
                        editMode={editMode}
                        draft={draft}
                        onDraftValueChange={
                          onDraftValueChange
                        }
                      />
                    )}

                  {!isReleaseNumbering && (
                    <span
                      className="metadata-numbering-divider"
                      aria-hidden="true"
                    >
                      /
                    </span>
                  )}

                  {discTotalItem && (
                    <MetadataValueCell
                      document={document}
                      row={discTotalItem.row}
                      editMode={editMode}
                      draft={draft}
                      onDraftValueChange={
                        onDraftValueChange
                      }
                    />
                  )}

                  {isReleaseNumbering && (
                    <small>total</small>
                  )}
                </div>
              </div>
            </div>

            {relatedNumberingRows.length > 0 && (
              <details
                className="metadata-related-tags metadata-numbering-related-tags"
                open={
                  metadataSectionOpenState[
                    "Track & Disc Numbering:related"
                  ] ?? false
                }
                onToggle={(event) =>
                  handleMetadataSectionToggle(
                    "Track & Disc Numbering:related",
                    event,
                  )
                }
              >
                <summary>
                  <span
                    className="metadata-section-triangle"
                    aria-hidden="true"
                  />
                  <span>Related tags</span>
                </summary>

                <div className="metadata-related-tags-body">
                  {relatedNumberingRows.map(
                    renderMetadataRow,
                  )}
                </div>
              </details>
            )}
          </details>
    ) : null;

  return (
    <article
      className="metadata-document-table"
      data-metadata-document-path={document.relativePath}
      tabIndex={-1}
    >
      {editMode && (
        <header className="document-edit-actions">
          <div className="document-save-controls">
            <span
              className={
                documentChangeCount > 0
                  ? "badge preview"
                  : "badge complete"
              }
            >
              {documentChangeCount > 0
                ? `${documentChangeCount} modified`
                : "No changes"}
            </span>

            <button
              type="button"
              disabled={
                saving ||
                documentChangeCount === 0
              }
              onClick={onSave}
            >
              {saving
                ? "Saving…"
                : "Save changes"}
            </button>
          </div>
        </header>
      )}

      {editMode &&
        missingCategoryFields.length > 0 && (
        <section className="missing-metadata-fields">
          <header>
            <div>
              <span className="eyebrow">
                Add metadata fields
              </span>
              <h3>
                Available fields for this category
              </h3>
              <p>
                Select only the fields you need.
                New fields are created in{" "}
                <code>{document.filename}</code>.
              </p>
            </div>
          </header>

          <div className="missing-metadata-field-list">
            {missingCategoryFields.map(
              (field) => (
                <label
                  key={field.tomlPath}
                  className="missing-metadata-field-option"
                >
                  <input
                    type="checkbox"
                    checked={selectedMissingFieldPaths.includes(
                      field.tomlPath,
                    )}
                    onChange={(event) =>
                      setSelectedMissingFieldPaths(
                        (current) =>
                          event.target.checked
                            ? [
                                ...current,
                                field.tomlPath,
                              ]
                            : current.filter(
                                (path) =>
                                  path !==
                                  field.tomlPath,
                              ),
                      )
                    }
                  />

                  <span>
                    <strong>
                      {field.label}
                    </strong>
                    <small>
                      {field.description}
                    </small>
                  </span>
                </label>
              ),
            )}
          </div>

          <div className="missing-metadata-field-actions">
            <button
              type="button"
              disabled={
                selectedMissingFieldPaths.length === 0 ||
                addingFields ||
                saving
              }
              onClick={() =>
                onAddFields(
                  document,
                  missingCategoryFields.filter(
                    (field) =>
                      selectedMissingFieldPaths.includes(
                        field.tomlPath,
                      ),
                  ),
                )
              }
            >
              {addingFields
                ? "Adding fields…"
                : `Add selected fields (${selectedMissingFieldPaths.length})`}
            </button>
          </div>
        </section>
      )}

      <div className="metadata-table-header">
        <span>Metadata key</span>
        <span>Value</span>
      </div>

      <div
        ref={metadataSectionsRef}
        className="metadata-table-body"
      >
        {displayStandardSections.map(
          (section) => (
            <Fragment key={section.group}>
              {!hasIdentitySection &&
                section.group === "Dates" &&
                numberingSection}

              <details
              className="metadata-section"
              data-metadata-section
              data-metadata-section-id={
                section.group
              }
              open={
                metadataSectionOpenState[
                  section.group
                ] ?? true
              }
              onToggle={(event) =>
                handleMetadataSectionToggle(
                  section.group,
                  event,
                )
              }
            >
              <summary
                onClick={
                  handleMetadataSectionClick
                }
              >
                <span
                  className="metadata-section-triangle"
                  aria-hidden="true"
                />

                <span className="metadata-section-heading">
                  <strong>
                    {section.group}
                  </strong>

                  {section.group === "Performers" && (
                    <button
                      type="button"
                      className="metadata-field-control"
                      tabIndex={-1}
                      aria-label="Help and field information for Performers"
                      title="Help for Performers"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPerformerHelpOpen(true);
                      }}
                    >
                      ?
                    </button>
                  )}
                </span>

                <span className="metadata-section-summary-actions">
                  <small>
                    {section.group ===
                    unmappedMetadataGroup
                      ? `${document.filename} · ${section.rows.length} ${
                          section.rows.length === 1
                            ? "field"
                            : "fields"
                        }`
                      : section.group ===
                    "Performers"
                      ? editMode
                        ? `${performerRecords.length} ${
                            performerRecords.length === 1
                              ? "credit"
                              : "credits"
                          }`
                        : `${groupedPerformerRecords.length} ${
                            groupedPerformerRecords.length === 1
                              ? "performer"
                              : "performers"
                          }`
                      : section.group ===
                          "Songwriting & Composition" &&
                        supportsWritingCreditRecords
                        ? editMode
                          ? `${writingCreditRecords.length} ${
                              writingCreditRecords.length === 1
                                ? "credit"
                                : "credits"
                            }`
                          : `${groupedWritingCredits.length} ${
                              groupedWritingCredits.length === 1
                                ? "person"
                                : "people"
                            }`
                      : section.group ===
                          "Samples & Interpolations" &&
                        supportsSampleRelationshipRecords
                        ? `${sampleRelationshipRecords.length} ${
                            sampleRelationshipRecords.length === 1
                              ? "source"
                              : "sources"
                          }`
                      : section.group ===
                          "Sample Clearance" &&
                        supportsSampleClearanceRecords
                        ? `${sampleClearanceRecords.length} ${
                            sampleClearanceRecords.length === 1
                              ? "record"
                              : "records"
                          }`
                      : section.group ===
                          "Arrangement & Orchestration" &&
                        supportsArrangementCreditRecords
                        ? editMode
                          ? `${arrangementCreditRecords.length} ${
                              arrangementCreditRecords.length === 1
                                ? "credit"
                                : "credits"
                            }`
                          : `${groupedArrangementCredits.length} ${
                              groupedArrangementCredits.length === 1
                                ? "person"
                                : "people"
                            }`
                      : section.group ===
                          engineeringCreditSummaryGroup
                        ? editMode
                          ? `${technicalCreditRecords.length} ${
                              technicalCreditRecords.length === 1
                                ? "credit"
                                : "credits"
                            }`
                          : `${groupedEngineeringCredits.length} ${
                              groupedEngineeringCredits.length === 1
                                ? "person"
                                : "people"
                            }`
                        : section.group ===
                            "Release & Track Identity" &&
                          defaultTrackIdentityMissingFields.length >
                            0
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultTrackIdentityMissingFields.length
                            } fields`
                        : section.group ===
                            "Musical Analysis" &&
                          defaultTrackOverviewMissingFields.length >
                            0
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultTrackOverviewMissingFields.length
                            } fields`
                        : section.group ===
                            "Language & Writing System" &&
                          defaultLyricsLanguageMissingFields.length >
                            0
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultLyricsLanguageMissingFields.length
                            } fields`
                        : [
                            "Production",
                            "Recording",
                            "Editing",
                          ].includes(section.group) &&
                          defaultProductionContextMissingFields.some(
                            (field) =>
                              field.presentation?.group ===
                              section.group,
                          )
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultProductionContextMissingFields.filter(
                                (field) =>
                                  field.presentation?.group ===
                                  section.group,
                              ).length
                            } fields`
                        : section.group ===
                            "Music Business & Rights" &&
                          defaultRightsMissingFields.length > 0
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultRightsMissingFields.length
                            } fields`
                          : `${section.rows.length} ${
                              section.rows.length === 1
                                ? "field"
                                : "fields"
                            }`}
                  </small>

                  {section.group === "Performers" &&
                    supportsPerformerRecords &&
                    savedPerformerRecords.length > 0 && (
                      <button
                        type="button"
                        className="metadata-section-copy-button"
                        disabled={
                          performerDraft !== undefined ||
                          (editMode &&
                            !canFinishEditing)
                        }
                        title={
                          performerDraft !== undefined ||
                          (editMode &&
                            !canFinishEditing)
                            ? "Save or discard browser edits before copying performer credits."
                            : document.scope === "release"
                              ? "Copy selected release performer credits into track-level overrides"
                              : "Copy selected saved performer credits to other tracks in this release"
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onCopyPerformerCredits(
                            savedPerformerRecords,
                          );
                        }}
                      >
                        Copy credits
                      </button>
                    )}

                  {renderSectionEditButton()}
                </span>
              </summary>

              <div className="metadata-section-rows">
                {section.group ===
                  engineeringCreditSummaryGroup && (
                  <TechnicalCreditRecordEditor
                    document={document}
                    records={
                      technicalCreditRecords
                    }
                    inheritedRecords={
                      inheritedTechnicalCreditRecords
                    }
                    releaseDefaultRecords={
                      releaseTechnicalCreditRecords
                    }
                    editMode={editMode}
                    metadataRegistry={
                      documentMetadataRegistry
                    }
                    relatedOpen={
                      metadataSectionOpenState[
                        `${engineeringCreditSummaryGroup}:related`
                      ] ?? false
                    }
                    onRelatedToggle={(event) =>
                      handleMetadataSectionToggle(
                        `${engineeringCreditSummaryGroup}:related`,
                        event,
                      )
                    }
                    onChange={
                      onTechnicalCreditDraftChange
                    }
                  />
                )}

                {section.group ===
                  "Songwriting & Composition" &&
                  supportsWritingCreditRecords && (
                  <WritingCreditRecordEditor
                    document={document}
                    records={writingCreditRecords}
                    inheritedRecords={
                      inheritedWritingCreditRecords
                    }
                    releaseDefaultRecords={
                      releaseWritingCreditRecords
                    }
                    editMode={editMode}
                    metadataRegistry={
                      documentMetadataRegistry
                    }
                    relatedOpen={
                      metadataSectionOpenState[
                        "Songwriting & Composition:related"
                      ] ?? false
                    }
                    onRelatedToggle={(event) =>
                      handleMetadataSectionToggle(
                        "Songwriting & Composition:related",
                        event,
                      )
                    }
                    onChange={
                      onWritingCreditDraftChange
                    }
                  />
                )}

                {section.group ===
                  "Samples & Interpolations" &&
                  supportsSampleRelationshipRecords && (
                  <Suspense
                    fallback={
                      <p className="metadata-record-empty-state">
                        Loading sample relationship editor…
                      </p>
                    }
                  >
                    <LazySampleRelationshipRecordEditor
                      records={sampleRelationshipRecords}
                      editMode={editMode}
                      onChange={onSampleRelationshipDraftChange}
                    />
                  </Suspense>
                )}

                {section.group ===
                  "Sample Clearance" &&
                  supportsSampleClearanceRecords && (
                  <Suspense
                    fallback={
                      <p className="metadata-record-empty-state">
                        Loading sample clearance editor…
                      </p>
                    }
                  >
                    <LazySampleClearanceRecordEditor
                      records={sampleClearanceRecords}
                      sampleCount={sampleRelationshipRecords.length}
                      editMode={editMode}
                      onChange={onSampleClearanceDraftChange}
                    />
                  </Suspense>
                )}

                {section.group ===
                  "Arrangement & Orchestration" &&
                  supportsArrangementCreditRecords && (
                  <ArrangementCreditRecordEditor
                    document={document}
                    records={
                      arrangementCreditRecords
                    }
                    inheritedRecords={
                      inheritedArrangementCreditRecords
                    }
                    releaseDefaultRecords={
                      releaseArrangementCreditRecords
                    }
                    editMode={editMode}
                    metadataRegistry={
                      documentMetadataRegistry
                    }
                    relatedOpen={
                      metadataSectionOpenState[
                        "Arrangement & Orchestration:related"
                      ] ?? false
                    }
                    onRelatedToggle={(event) =>
                      handleMetadataSectionToggle(
                        "Arrangement & Orchestration:related",
                        event,
                      )
                    }
                    onChange={
                      onArrangementCreditDraftChange
                    }
                  />
                )}

                {section.group ===
                  "Performers" && (
                  <PerformerRecordEditor
                    document={document}
                    records={
                      performerRecords
                    }
                    releasePrimaryArtistName={
                      releasePrimaryArtistName
                    }
                    releaseDefaultRecords={
                      releasePerformerRecords
                    }
                    inheritedFromRelease={
                      performersInheritedFromRelease
                    }
                    editMode={editMode}
                    metadataRegistry={
                      documentMetadataRegistry
                    }
                    relatedOpen={
                      metadataSectionOpenState[
                        "Performers:related"
                      ] ?? false
                    }
                    onRelatedToggle={(event) =>
                      handleMetadataSectionToggle(
                        "Performers:related",
                        event,
                      )
                    }
                    onChange={
                      onPerformerDraftChange
                    }
                    onCustomizeTrack={
                      document.scope === "track"
                        ? () =>
                            onPerformerDraftChange(
                              createTrackPerformerOverride(
                                releasePerformerRecords,
                              ),
                            )
                        : undefined
                    }
                    onUseRelease={
                      document.scope === "track"
                        ? () => {
                            if (
                              localPerformerRecords.length > 0 &&
                              !window.confirm(
                                "Remove this track's local performer override and use the release performers?",
                              )
                            ) {
                              return;
                            }

                            onPerformerDraftChange([]);
                          }
                        : undefined
                    }
                  />
                )}

                {section.group ===
                  unmappedMetadataGroup && (
                  <div className="metadata-unmapped-guidance">
                    <strong>
                      Preserved from {document.filename}
                    </strong>
                    <p>
                      These authored fields are not yet registered with a
                      dedicated editor. Their canonical paths remain visible
                      and their values are preserved unchanged.
                    </p>
                  </div>
                )}

                {renderSectionPrimaryRows(
                  section,
                )}

                {section.group ===
                  "Release & Track Identity" &&
                  defaultTrackIdentityMissingFields.map(
                    renderDefaultMissingField,
                  )}

                {section.rows.some(
                  ({ row }) =>
                    !isPerformerRecordPath(
                      row.path,
                    ) &&
                    getReleaseContributorRecordIndex(
                      row.path,
                    ) === null &&
                    isRelatedMetadataTagPath(
                      row.path,
                    ),
                ) && (
                  <details
                    className="metadata-related-tags"
                    open={
                      metadataSectionOpenState[
                        `${section.group}:related`
                      ] ?? false
                    }
                    onToggle={(event) =>
                      handleMetadataSectionToggle(
                        `${section.group}:related`,
                        event,
                      )
                    }
                  >
                    <summary>
                      <span
                        className="metadata-section-triangle"
                        aria-hidden="true"
                      />
                      <span>Related tags</span>
                    </summary>

                    <div className="metadata-related-tags-body">
                      {section.rows
                        .filter(
                          ({ row }) =>
                            !isPerformerRecordPath(
                              row.path,
                            ) &&
                            getReleaseContributorRecordIndex(
                              row.path,
                            ) === null &&
                            isRelatedMetadataTagPath(
                              row.path,
                            ),
                        )
                        .map(
                          renderMetadataRow,
                        )}
                    </div>
                  </details>
                )}

                {section.group === "Artists" &&
                  releaseContributorRecords.length >
                    0 && (
                    <div className="release-contributor-list">
                      {releaseContributorRecords.map(
                        (record) => {
                          const orderedRows =
                            [...record.rows].sort(
                              (left, right) => {
                                const order = (
                                  path: string,
                                ) => {
                                  switch (
                                    getReleaseContributorLeaf(
                                      path,
                                    )
                                  ) {
                                    case "name":
                                      return 10;
                                    case "role":
                                      return 20;
                                    case "sort_name":
                                      return 30;
                                    default:
                                      return 40;
                                  }
                                };

                                return (
                                  order(
                                    left.row.path,
                                  ) -
                                  order(
                                    right.row.path,
                                  )
                                );
                              },
                            );

                          const primaryRows =
                            orderedRows.filter(
                              ({ row }) =>
                                getReleaseContributorLeaf(
                                  row.path,
                                ) !==
                                "sort_name",
                            );

                          const advancedRows =
                            orderedRows.filter(
                              ({ row }) =>
                                getReleaseContributorLeaf(
                                  row.path,
                                ) ===
                                "sort_name",
                            );

                          return (
                            <article
                              key={record.index}
                              className="release-contributor-card"
                            >
                              <header>
                                <div>
                                  <span className="eyebrow">
                                    Release contributor
                                  </span>
                                  <h5>
                                    Contributor{" "}
                                    {record.index + 1}
                                  </h5>
                                </div>
                              </header>

                              <div className="release-contributor-fields">
                                {primaryRows.map(
                                  ({
                                    row,
                                    fieldDefinition,
                                  }) => {
                                    const leaf =
                                      getReleaseContributorLeaf(
                                        row.path,
                                      );

                                    return (
                                      <div
                                        key={row.path}
                                        className="release-contributor-field"
                                      >
                                        <div className="release-contributor-field-label">
                                          <strong>
                                            {getContributorFieldLabel(
                                              leaf,
                                            )}
                                          </strong>

                                          <MetadataFieldControls
                                            field={
                                              fieldDefinition
                                            }
                                            path={
                                              row.path
                                            }
                                            valueType={
                                              row.valueType
                                            }
                                          />
                                        </div>

                                        <MetadataValueCell
                                          document={
                                            document
                                          }
                                          row={row}
                                          field={
                                            fieldDefinition
                                          }
                                          editMode={
                                            editMode
                                          }
                                          draft={
                                            draft
                                          }
                                          onDraftValueChange={
                                            onDraftValueChange
                                          }
                                        />
                                      </div>
                                    );
                                  },
                                )}
                              </div>

                              {advancedRows.length >
                                0 && (
                                <details className="release-contributor-advanced">
                                  <summary>
                                    Advanced
                                  </summary>

                                  <p>
                                    Sort name controls
                                    alphabetical ordering.
                                    Leave it blank when the
                                    display name already sorts
                                    correctly.
                                  </p>

                                  <div className="release-contributor-fields">
                                    {advancedRows.map(
                                      ({
                                        row,
                                        fieldDefinition,
                                      }) => (
                                        <div
                                          key={
                                            row.path
                                          }
                                          className="release-contributor-field"
                                        >
                                          <div className="release-contributor-field-label">
                                            <strong>
                                              Sort name
                                            </strong>

                                            <MetadataFieldControls
                                              field={
                                                fieldDefinition
                                              }
                                              path={
                                                row.path
                                              }
                                              valueType={
                                                row.valueType
                                              }
                                            />
                                          </div>

                                          <MetadataValueCell
                                            document={
                                              document
                                            }
                                            row={
                                              row
                                            }
                                            field={
                                              fieldDefinition
                                            }
                                            editMode={
                                              editMode
                                            }
                                            draft={
                                              draft
                                            }
                                            onDraftValueChange={
                                              onDraftValueChange
                                            }
                                          />
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </details>
                              )}
                            </article>
                          );
                        },
                      )}
                    </div>
                  )}
              </div>
              </details>

              {section.group ===
                "Release & Track Identity" &&
                numberingSection}
            </Fragment>
          ),
        )}

        {!hasIdentitySection &&
          !hasDatesSection &&
          numberingSection}
      </div>

      {performerHelpOpen && (
        <MetadataFieldPairHelpModal
          {...performerHelpProps}
          onClose={() =>
            setPerformerHelpOpen(false)
          }
        />
      )}

      {pendingFieldRemoval && (
        <MetadataFieldModal
          title={`Remove ${pendingFieldRemoval.field.label}?`}
          onClose={() =>
            setPendingFieldRemoval(null)
          }
        >
          <section className="metadata-field-removal-confirmation">
            <p>
              This removes the optional field from
              <code>{document.filename}</code>. A verified backup is
              created before the TOML document is replaced.
            </p>

            <dl>
              <div>
                <dt>Canonical path</dt>
                <dd>
                  <code>
                    {pendingFieldRemoval.field.tomlPath}
                  </code>
                </dd>
              </div>
              <div>
                <dt>Current value</dt>
                <dd>
                  {isBlankMetadataValue(
                    pendingFieldRemoval.row.value,
                  )
                    ? "Blank"
                    : "This field contains a value"}
                </dd>
              </div>
            </dl>

            <p className="metadata-field-removal-warning">
              Removing a populated field also removes its local value.
              Inherited release values are not deleted.
            </p>

            <div className="metadata-field-removal-actions">
              <button
                type="button"
                onClick={() =>
                  setPendingFieldRemoval(null)
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={
                  removingFieldKey !== null
                }
                onClick={() => {
                  const field =
                    pendingFieldRemoval.field;

                  setPendingFieldRemoval(null);
                  onRemoveField(
                    document,
                    field,
                  );
                }}
              >
                Remove field
              </button>
            </div>
          </section>
        </MetadataFieldModal>
      )}

    </article>
  );
}

export {
  MetadataDocumentTable,
};
