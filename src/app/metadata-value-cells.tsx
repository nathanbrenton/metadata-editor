import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FlattenedMetadataRow } from "../metadata-flattener.js";
import { sortArrangementCreditDisplayRecords } from "../arrangement-credit-role.js";
import { sortWritingCreditDisplayRecords } from "../writing-credit-role.js";
import type {
  SampleClearanceRecordDraft,
  SampleRelationshipRecordDraft,
} from "../sample-relationship.js";
import { sortTechnicalCreditDisplayRecords } from "../technical-credit-role.js";
import {
  formatGuidedCopyrightNotice,
  formatGuidedCopyrightNoticeValue,
  formatGuidedRightsStatement,
  getGuidedCopyrightNoticeConfig,
  getRightsStatementSymbol,
  isGuidedCopyrightNoticePath,
  parseGuidedCopyrightNotice,
  parseGuidedRightsStatement,
  type RightsStatementSymbol,
} from "../rights-statement.js";
import {
  findMetadataValueAcrossDocuments,
  isBlankMetadataValue,
} from "../release-inheritance.js";
import { metadataRowMatchesNotesTab } from "../metadata-tab-routing.js";
import {
  camelotKeyForMusicalKey,
  isValidTuningReference,
} from "../../shared/musical-analysis.js";
import { generateTrackSortTitle } from "../track-derived-metadata.js";
import { artistNamePathForSortNamePath } from "../artist-sort-name.js";
import { generateArtistSortName } from "../../shared/artist-sort-name.js";
import {
  releaseEditorialSnapshotEntries,
  releaseEditorialSnapshotValue,
} from "../../shared/editorial-profile.js";
import {
  defaultLicenseValue,
  isLicenseMetadataPath,
} from "../../shared/rights-defaults.js";
import { productionContextFields } from "../../shared/production-context.js";
import { formatTrackDisplayTitle } from "../../shared/track-title.js";
import {
  getCalendarInputValue,
  getLegacyCalendarDateValue,
  isCalendarDateMetadataPath,
} from "../metadata-date.js";
import { resolveEffectiveTrackLanguage } from "../lyrics-language.js";
import {
  type ArrangementCreditDraftMap,
  type EditableMetadataValue,
  type MetadataDraft,
  type PerformerDraftMap,
  type PerformerRecordDraft,
  type SampleClearanceDraftMap,
  type SampleRelationshipDraftMap,
  type TechnicalCreditDraftMap,
  type WritingCreditDraftMap,
  type WritingCreditRecordDraft,
  buildDocumentDraftKey,
  editorTextToStringArray,
  groupPersonRoleDisplayRecords,
  isEditableMetadataValue,
  normalizeStringArrayEditorValue,
  parseDraftNumber,
  readArrangementCreditRecords,
  readDocumentDraftString,
  readReleaseEditorialSnapshot,
  readTechnicalCreditRecords,
  readWritingCreditRecords,
  stringArrayToEditorText,
} from "./metadata-records.js";
import {
  LazyReleaseAboutGenerator,
  formatMetadataValue,
} from "./foundation.js";
import {
  MetadataDocumentTable,
} from "./MetadataDocumentTable.js";
import type {
  MetadataFieldDefinition,
  MetadataFileStatus,
  ParsedMetadataDocument,
  ReleaseMetadataTab,
} from "./types.js";
import {
  isTrackDiscNumberingPath,
} from "./metadata-field-guidance.js";

function MetadataDocumentSection({
  title,
  documents,
  releaseDocuments,
  editMode,
  canFinishEditing,
  onBeginEdit,
  onDoneEditing,
  draft,
  performerDrafts,
  technicalCreditDrafts,
  arrangementCreditDrafts,
  writingCreditDrafts,
  sampleRelationshipDrafts,
  sampleClearanceDrafts,
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
  savingDocumentPath,
  addingFieldsPath,
  removingFieldKey,
  missingTrackCreditsFile,
  creatingTrackCredits,
  onSaveDocument,
  onAddFields,
  onRemoveField,
  onCreateTrackCreditsDocument,
}: {
  title: string;
  documents: ParsedMetadataDocument[];
  releaseDocuments: ParsedMetadataDocument[];
  editMode: boolean;
  canFinishEditing: boolean;
  onBeginEdit: () => void;
  onDoneEditing: () => void;
  draft: MetadataDraft;
  performerDrafts: PerformerDraftMap;
  technicalCreditDrafts:
    TechnicalCreditDraftMap;
  arrangementCreditDrafts:
    ArrangementCreditDraftMap;
  writingCreditDrafts:
    WritingCreditDraftMap;
  sampleRelationshipDrafts:
    SampleRelationshipDraftMap;
  sampleClearanceDrafts:
    SampleClearanceDraftMap;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
  onPerformerDraftChange: (
    document: ParsedMetadataDocument,
    records: PerformerRecordDraft[],
  ) => void;
  onTechnicalCreditDraftChange: (
    document: ParsedMetadataDocument,
    records: PerformerRecordDraft[],
  ) => void;
  onArrangementCreditDraftChange: (
    document: ParsedMetadataDocument,
    records: PerformerRecordDraft[],
  ) => void;
  onWritingCreditDraftChange: (
    document: ParsedMetadataDocument,
    records: WritingCreditRecordDraft[],
  ) => void;
  onSampleRelationshipDraftChange: (
    document: ParsedMetadataDocument,
    records: SampleRelationshipRecordDraft[],
  ) => void;
  onSampleClearanceDraftChange: (
    document: ParsedMetadataDocument,
    records: SampleClearanceRecordDraft[],
  ) => void;
  onCopyPerformerCredits: (
    document: ParsedMetadataDocument,
    records: PerformerRecordDraft[],
  ) => void;
  metadataRegistry: MetadataFieldDefinition[];
  activeMetadataTab: ReleaseMetadataTab;
  savingDocumentPath: string | null;
  addingFieldsPath: string | null;
  removingFieldKey: string | null;
  missingTrackCreditsFile?:
    MetadataFileStatus;
  creatingTrackCredits: boolean;
  onSaveDocument: (
    document: ParsedMetadataDocument,
  ) => void;
  onAddFields: (
    document: ParsedMetadataDocument,
    fields: MetadataFieldDefinition[],
  ) => void;
  onRemoveField: (
    document: ParsedMetadataDocument,
    field: MetadataFieldDefinition,
  ) => void;
  onCreateTrackCreditsDocument: (
    file: MetadataFileStatus,
    initialCreditKind:
      | "technical"
      | "arrangement"
      | "writing"
      | "samples",
  ) => void;
}) {
  const releaseTechnicalCredits =
    releaseDocuments.flatMap(
      (releaseDocument) =>
        releaseDocument.filename ===
        "release.toml"
          ? readTechnicalCreditRecords(
              releaseDocument,
            )
          : [],
    );
  const groupedReleaseTechnicalCredits =
    groupPersonRoleDisplayRecords(
      sortTechnicalCreditDisplayRecords(
        releaseTechnicalCredits.map(
          (record) => ({
            key: record.key,
            name: record.name,
            role: record.role,
            sortName: record.sortName,
          }),
        ),
      ),
    );

  const releaseArrangementCredits =
    releaseDocuments.flatMap(
      (releaseDocument) =>
        releaseDocument.filename ===
        "release.toml"
          ? readArrangementCreditRecords(
              releaseDocument,
            )
          : [],
    );
  const groupedReleaseArrangementCredits =
    groupPersonRoleDisplayRecords(
      sortArrangementCreditDisplayRecords(
        releaseArrangementCredits.map(
          (record) => ({
            key: record.key,
            name: record.name,
            role: record.role,
            sortName: record.sortName,
          }),
        ),
      ),
    );

  const releaseWritingCredits =
    releaseDocuments.flatMap((releaseDocument) =>
      releaseDocument.filename === "release.toml"
        ? readWritingCreditRecords(releaseDocument)
        : [],
    );
  const groupedReleaseWritingCredits =
    groupPersonRoleDisplayRecords(
      sortWritingCreditDisplayRecords(
        releaseWritingCredits.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
          family: record.family,
        })),
      ),
    );

  return (
    <section className="metadata-detail-section">
      {activeMetadataTab === "raw" && (
        <header className="raw-toml-section-header">
          <div>
            <h2>{title}</h2>
            {documents.length === 1 && (
              <code>
                {documents[0]?.filename}
              </code>
            )}
          </div>
          <span className="badge preview">
            {documents.length} files
          </span>
        </header>
      )}

      {activeMetadataTab ===
        "recording" &&
        missingTrackCreditsFile && (
          <div className="technical-credit-file-empty-state">
            <div>
              <strong>
                Recording, mixing and mastering credits
              </strong>
              <p>
                {groupedReleaseTechnicalCredits.length > 0
                  ? "This track is using the release-level technical-credit defaults. Create a track credits document only when this track needs an override."
                  : "No track-credits.toml document exists for this track yet."}
              </p>

              {groupedReleaseTechnicalCredits.length > 0 && (
                <div className="missing-track-inherited-credit-list">
                  {groupedReleaseTechnicalCredits.map(
                    (credit) => (
                      <div key={credit.key}>
                        <strong>
                          {credit.roles.join(", ")}
                        </strong>
                        <span>{credit.name}</span>
                        <small className="metadata-provenance-note metadata-inherited-note">
                          Inherited from release
                        </small>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            {editMode ? (
              <button
                type="button"
                className={[
                  "performer-add-button",
                  creatingTrackCredits
                    ? "is-loading"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={
                  creatingTrackCredits
                }
                aria-busy={
                  creatingTrackCredits
                }
                onClick={() =>
                  onCreateTrackCreditsDocument(
                    missingTrackCreditsFile,
                    "technical",
                  )
                }
              >
                <span aria-hidden="true">
                  +
                </span>
                <span>
                  {creatingTrackCredits
                    ? "Preparing technical credits…"
                    : groupedReleaseTechnicalCredits.length > 0
                      ? "Add track override"
                      : "Add technical credits"}
                </span>
              </button>
            ) : (
              <small>
                Enter Edit mode to add the first technical
                credit.
              </small>
            )}
          </div>
        )}

      {activeMetadataTab ===
        "credits" &&
        missingTrackCreditsFile && (
          <div className="technical-credit-file-empty-state writing-credit-file-empty-state">
            <div>
              <strong>Songwriting &amp; composition credits</strong>
              <p>
                {groupedReleaseWritingCredits.length > 0
                  ? "This track is using the release-level songwriting defaults. Create a track credits document only when this track needs an override."
                  : "No track-credits.toml document exists for this track yet."}
              </p>

              {groupedReleaseWritingCredits.length > 0 && (
                <div className="missing-track-inherited-credit-list">
                  {groupedReleaseWritingCredits.map((credit) => (
                    <div key={credit.key}>
                      <strong>{credit.roles.join(", ")}</strong>
                      <span>{credit.name}</span>
                      <small className="metadata-provenance-note metadata-inherited-note">
                        Inherited from release
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {editMode ? (
              <button
                type="button"
                className={[
                  "performer-add-button",
                  creatingTrackCredits ? "is-loading" : "",
                ].filter(Boolean).join(" ")}
                disabled={creatingTrackCredits}
                aria-busy={creatingTrackCredits}
                onClick={() =>
                  onCreateTrackCreditsDocument(
                    missingTrackCreditsFile,
                    "writing",
                  )
                }
              >
                <span aria-hidden="true">+</span>
                <span>
                  {creatingTrackCredits
                    ? "Preparing songwriting credits…"
                    : groupedReleaseWritingCredits.length > 0
                      ? "Add track override"
                      : "Add songwriting credits"}
                </span>
              </button>
            ) : (
              <small>
                Enter Edit mode to add the first songwriting credit.
              </small>
            )}
          </div>
        )}

      {activeMetadataTab ===
        "credits" &&
        missingTrackCreditsFile && (
          <div className="technical-credit-file-empty-state arrangement-credit-file-empty-state">
            <div>
              <strong>
                Arrangement &amp; orchestration credits
              </strong>
              <p>
                {groupedReleaseArrangementCredits.length > 0
                  ? "This track is using the release-level arrangement and orchestration defaults. Create a track credits document only when this track needs an override."
                  : "No track-credits.toml document exists for this track yet."}
              </p>

              {groupedReleaseArrangementCredits.length > 0 && (
                <div className="missing-track-inherited-credit-list">
                  {groupedReleaseArrangementCredits.map(
                    (credit) => (
                      <div key={credit.key}>
                        <strong>
                          {credit.roles.join(", ")}
                        </strong>
                        <span>{credit.name}</span>
                        <small className="metadata-provenance-note metadata-inherited-note">
                          Inherited from release
                        </small>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            {editMode ? (
              <button
                type="button"
                className={[
                  "performer-add-button",
                  creatingTrackCredits
                    ? "is-loading"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={creatingTrackCredits}
                aria-busy={creatingTrackCredits}
                onClick={() =>
                  onCreateTrackCreditsDocument(
                    missingTrackCreditsFile,
                    "arrangement",
                  )
                }
              >
                <span aria-hidden="true">+</span>
                <span>
                  {creatingTrackCredits
                    ? "Preparing arrangement credits…"
                    : groupedReleaseArrangementCredits.length > 0
                      ? "Add track override"
                      : "Add arrangement credits"}
                </span>
              </button>
            ) : (
              <small>
                Enter Edit mode to add the first arrangement
                credit.
              </small>
            )}
          </div>
        )}

      {activeMetadataTab === "credits" && missingTrackCreditsFile && (
        <div className="technical-credit-file-empty-state sample-credit-file-empty-state">
          <div>
            <strong>Samples &amp; interpolations</strong>
            <p>
              Create track-credits.toml to record sampled recordings,
              interpolations, musical quotations, or lyrical quotations.
            </p>
          </div>
          {editMode ? (
            <button
              type="button"
              className="performer-add-button"
              disabled={creatingTrackCredits}
              onClick={() =>
                onCreateTrackCreditsDocument(
                  missingTrackCreditsFile,
                  "samples",
                )
              }
            >
              <span aria-hidden="true">+</span>
              <span>{creatingTrackCredits ? "Preparing samples…" : "Add sample credit"}</span>
            </button>
          ) : (
            <small>Enter Edit mode to add the first sample credit.</small>
          )}
        </div>
      )}

      {activeMetadataTab === "rights" && missingTrackCreditsFile && (
        <div className="technical-credit-file-empty-state sample-clearance-file-empty-state">
          <div>
            <strong>Sample clearance</strong>
            <p>
              Create track-credits.toml to keep private master-use and
              publishing-clearance status linked to numbered sample sources.
            </p>
          </div>
          <small>
            Add the related source under Artists, Performers &amp; Writers →
            Samples &amp; Interpolations first. The clearance editor becomes
            available after track-credits.toml exists.
          </small>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="empty-state">
          No metadata documents exist for this selection yet.
        </p>
      ) : (
        <div className="metadata-category-documents">
          {documents.map((document) => (
            <MetadataDocumentTable
              key={document.relativePath}
              document={document}
              releaseDocuments={
                releaseDocuments
              }
              editMode={editMode}
              canFinishEditing={
                canFinishEditing
              }
              onBeginEdit={onBeginEdit}
              onDoneEditing={
                onDoneEditing
              }
              draft={draft}
              performerDraft={
                performerDrafts[
                  document.relativePath
                ]
              }
              technicalCreditDraft={
                technicalCreditDrafts[
                  document.relativePath
                ]
              }
              arrangementCreditDraft={
                arrangementCreditDrafts[
                  document.relativePath
                ]
              }
              writingCreditDraft={
                writingCreditDrafts[
                  document.relativePath
                ]
              }
              sampleRelationshipDraft={
                sampleRelationshipDrafts[
                  document.relativePath
                ]
              }
              sampleClearanceDraft={
                sampleClearanceDrafts[
                  document.relativePath
                ]
              }
              onDraftValueChange={
                onDraftValueChange
              }
              onPerformerDraftChange={(
                records,
              ) =>
                onPerformerDraftChange(
                  document,
                  records,
                )
              }
              onTechnicalCreditDraftChange={(
                records,
              ) =>
                onTechnicalCreditDraftChange(
                  document,
                  records,
                )
              }
              onArrangementCreditDraftChange={(
                records,
              ) =>
                onArrangementCreditDraftChange(
                  document,
                  records,
                )
              }
              onWritingCreditDraftChange={(
                records,
              ) =>
                onWritingCreditDraftChange(
                  document,
                  records,
                )
              }
              onSampleRelationshipDraftChange={(records) =>
                onSampleRelationshipDraftChange(document, records)
              }
              onSampleClearanceDraftChange={(records) =>
                onSampleClearanceDraftChange(document, records)
              }
              onCopyPerformerCredits={(
                records,
              ) =>
                onCopyPerformerCredits(
                  document,
                  records,
                )
              }
              metadataRegistry={
                metadataRegistry
              }
              activeMetadataTab={
                activeMetadataTab
              }
              saving={
                savingDocumentPath ===
                document.relativePath
              }
              addingFields={
                addingFieldsPath ===
                document.relativePath
              }
              removingFieldKey={
                removingFieldKey
              }
              onAddFields={
                onAddFields
              }
              onRemoveField={
                onRemoveField
              }
              onSave={() =>
                onSaveDocument(document)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

const playerCompatibilityLabels = {
  vlc: "VLC",
  appleMusic: "Apple Music",
  windowsMediaPlayer:
    "Windows Media Player",
  windowsMediaPlayerLegacy:
    "Windows Media Player Legacy",
} as const;

function MetadataCompatibilityNotes({
  field,
}: {
  field: MetadataFieldDefinition;
}) {
  if (
    !field.playerCompatibility ||
    field.playerCompatibility.length === 0
  ) {
    return null;
  }

  return (
    <ul className="metadata-compatibility-notes">
      {field.playerCompatibility.map(
        (result) => (
          <li
            key={[
              result.player,
              result.containers.join("-"),
              result.status,
            ].join(":")}
            className={`compatibility-${result.status}`}
          >
            <strong>
              {
                playerCompatibilityLabels[
                  result.player
                ]
              }
            </strong>

            <span>
              {result.status.replace("-", " ")}
              {" · "}
              {result.containers.join(", ")}
            </span>

            <p>{result.note}</p>
          </li>
        ),
      )}
    </ul>
  );
}

const controlledVocabularyOtherValue =
  "__metadata_other__";

function findControlledVocabularyOption(
  value: string,
  options: readonly string[],
): string | undefined {
  const normalizedValue = value
    .trim()
    .toLocaleLowerCase();

  if (!normalizedValue) {
    return undefined;
  }

  return options.find(
    (option) =>
      option.trim().toLocaleLowerCase() ===
      normalizedValue,
  );
}

function SelectOrCustomMetadataInput({
  value,
  options,
  onChange,
  selectLabel,
  customLabel = "Other…",
  customPlaceholder = "Enter a custom value",
  ariaInvalid,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  selectLabel: string;
  customLabel?: string;
  customPlaceholder?: string;
  ariaInvalid?: boolean;
}) {
  const matchedOption =
    findControlledVocabularyOption(
      value,
      options,
    );
  const [customMode, setCustomMode] =
    useState(
      value.trim().length > 0 &&
        matchedOption === undefined,
    );

  useEffect(() => {
    if (matchedOption) {
      setCustomMode(false);
      return;
    }

    if (value.trim()) {
      setCustomMode(true);
      return;
    }

    setCustomMode(false);
  }, [matchedOption, value]);

  const customValue = matchedOption
    ? ""
    : value;

  return (
    <span
      className={[
        "controlled-vocabulary-input",
        customMode ? "is-custom" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <select
        aria-label={selectLabel}
        aria-invalid={ariaInvalid}
        value={
          customMode
            ? controlledVocabularyOtherValue
            : matchedOption ?? ""
        }
        onChange={(event) => {
          const nextValue =
            event.target.value;

          if (
            nextValue ===
            controlledVocabularyOtherValue
          ) {
            setCustomMode(true);
            return;
          }

          setCustomMode(false);
          onChange(nextValue);
        }}
      >
        <option value="">
          Select a standard value…
        </option>
        {options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}
        <option
          value={
            controlledVocabularyOtherValue
          }
        >
          {customLabel}
        </option>
      </select>

      {customMode && (
        <input
          type="text"
          aria-label={`${selectLabel} custom value`}
          aria-invalid={ariaInvalid}
          value={customValue}
          placeholder={customPlaceholder}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />
      )}
    </span>
  );
}

function CopyrightNoticeInput({
  path,
  value,
  onChange,
}: {
  path: string;
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const config =
    getGuidedCopyrightNoticeConfig(path);
  const parsedValue =
    parseGuidedCopyrightNotice(value, path);
  const [customMode, setCustomMode] =
    useState(parsedValue === null);
  const [guidedHolder, setGuidedHolder] =
    useState(parsedValue?.holder ?? "");
  const lastEmittedGuidedValue =
    useRef<string | null>(null);

  useEffect(() => {
    const nextParsedValue =
      parseGuidedCopyrightNotice(
        value,
        path,
      );

    setCustomMode(nextParsedValue === null);
    setGuidedHolder(
      nextParsedValue?.holder ?? "",
    );
    lastEmittedGuidedValue.current = null;
  }, [path]);

  useEffect(() => {
    if (
      value ===
      lastEmittedGuidedValue.current
    ) {
      lastEmittedGuidedValue.current = null;
      return;
    }

    const nextParsedValue =
      parseGuidedCopyrightNotice(
        value,
        path,
      );

    if (nextParsedValue === null) {
      return;
    }

    setGuidedHolder(nextParsedValue.holder);
  }, [path, value]);

  if (!config) {
    return null;
  }

  const canonicalPlaceholder =
    `${config.prefix} ${config.symbol} Name. All rights reserved.`;
  const noticeKind =
    config.symbol === "℗"
      ? "sound recording copyright"
      : "copyright";

  if (customMode) {
    return (
      <span className="guided-copyright-input is-custom">
        <input
          type="text"
          aria-label={`Custom ${noticeKind} notice`}
          value={value}
          placeholder={canonicalPlaceholder}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />

        <button
          type="button"
          className="guided-rights-mode-button"
          onClick={() =>
            setCustomMode(false)
          }
        >
          Use guided format
        </button>

        {parsedValue === null &&
          value.trim() !== "" && (
            <small className="guided-rights-note">
              This existing custom value remains unchanged until the guided name field is edited.
            </small>
          )}
      </span>
    );
  }

  const updateHolder = (holder: string) => {
    setGuidedHolder(holder);

    const nextValue =
      formatGuidedCopyrightNotice(
        holder,
        path,
      );

    lastEmittedGuidedValue.current =
      nextValue;
    onChange(nextValue);
  };

  return (
    <span className="guided-copyright-input">
      <span className="guided-copyright-fragment">
        {config.prefix}
      </span>
      <span
        className="guided-copyright-fragment guided-copyright-symbol"
        aria-label={
          config.symbol === "℗"
            ? "Sound recording copyright symbol"
            : "Copyright symbol"
        }
        title={
          config.symbol === "℗"
            ? "Sound recording copyright"
            : "Copyright"
        }
      >
        {config.symbol}
      </span>
      <input
        type="text"
        aria-label={`${config.prefix} holder names`}
        value={guidedHolder}
        placeholder="Name or names"
        onChange={(event) =>
          updateHolder(event.target.value)
        }
      />
      <span
        className="guided-copyright-punctuation"
        aria-hidden="true"
      >
        .
      </span>
      <span className="guided-copyright-reservation">
        All rights reserved.
      </span>

      <button
        type="button"
        className="guided-rights-mode-button"
        onClick={() =>
          setCustomMode(true)
        }
      >
        Custom value
      </button>

      <small className="guided-rights-preview">
        Value preview: {
          formatGuidedCopyrightNotice(
            guidedHolder,
            path,
          ) || "Blank"
        }
      </small>
    </span>
  );
}

function GuidedRightsStatementInput({
  path,
  symbol,
  value,
  onChange,
}: {
  path: string;
  symbol: RightsStatementSymbol;
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const parsedValue =
    parseGuidedRightsStatement(
      value,
      symbol,
    );
  const [customMode, setCustomMode] =
    useState(parsedValue === null);
  const initialGuidedParts =
    parsedValue ?? {
      year: "",
      holder: "",
    };
  const [guidedYear, setGuidedYear] =
    useState(initialGuidedParts.year);
  const [guidedHolder, setGuidedHolder] =
    useState(initialGuidedParts.holder);

  // Preserve partial years and spaces while controlled inputs rerender.
  const lastEmittedGuidedValue =
    useRef<string | null>(null);

  useEffect(() => {
    const nextParsedValue =
      parseGuidedRightsStatement(
        value,
        symbol,
      );

    setCustomMode(nextParsedValue === null);
    setGuidedYear(
      nextParsedValue?.year ?? "",
    );
    setGuidedHolder(
      nextParsedValue?.holder ?? "",
    );
    lastEmittedGuidedValue.current = null;
  }, [path, symbol]);

  useEffect(() => {
    if (
      value ===
      lastEmittedGuidedValue.current
    ) {
      lastEmittedGuidedValue.current = null;
      return;
    }

    const nextParsedValue =
      parseGuidedRightsStatement(
        value,
        symbol,
      );

    if (nextParsedValue === null) {
      return;
    }

    setGuidedYear(nextParsedValue.year);
    setGuidedHolder(nextParsedValue.holder);
  }, [symbol, value]);

  if (customMode) {
    return (
      <span className="guided-rights-input is-custom">
        <input
          type="text"
          aria-label="Custom rights statement"
          value={value}
          placeholder={
            symbol === "℗"
              ? "℗ 2026 Rights Holder"
              : "© 2026 Rights Holder"
          }
          onChange={(event) =>
            onChange(event.target.value)
          }
        />

        <button
          type="button"
          className="guided-rights-mode-button"
          onClick={() =>
            setCustomMode(false)
          }
        >
          Use guided fields
        </button>

        {parsedValue === null &&
          value.trim() !== "" && (
            <small className="guided-rights-note">
              This existing custom value remains unchanged
              until a guided field is edited.
            </small>
          )}
      </span>
    );
  }

  const parts = {
    year: guidedYear,
    holder: guidedHolder,
  };
  const updateParts = (
    year: string,
    holder: string,
  ) => {
    // Keep the exact in-progress input locally. The emitted TOML value
    // remains normalized and never requires a literal symbol entry.
    setGuidedYear(year);
    setGuidedHolder(holder);

    const nextValue =
      formatGuidedRightsStatement(
        symbol,
        year,
        holder,
      );

    lastEmittedGuidedValue.current =
      nextValue;
    onChange(nextValue);
  };

  return (
    <span className="guided-rights-input">
      <span
        className="guided-rights-symbol"
        aria-label={
          symbol === "℗"
            ? "Phonographic copyright symbol"
            : "Copyright symbol"
        }
        title={
          symbol === "℗"
            ? "Phonographic copyright"
            : "Copyright"
        }
      >
        {symbol}
      </span>

      <input
        type="text"
        inputMode="numeric"
        aria-label="Rights year"
        value={parts.year}
        placeholder="Year"
        maxLength={4}
        onChange={(event) => {
          const nextYear =
            event.target.value
              .replace(/\D/g, "")
              .slice(0, 4);

          updateParts(
            nextYear,
            parts.holder,
          );
        }}
      />

      <input
        type="text"
        aria-label="Rights holder name"
        value={parts.holder}
        placeholder="Person or entity name"
        onChange={(event) =>
          updateParts(
            parts.year,
            event.target.value,
          )
        }
      />

      <button
        type="button"
        className="guided-rights-mode-button"
        onClick={() =>
          setCustomMode(true)
        }
      >
        Custom value
      </button>

      <small className="guided-rights-preview">
        Value preview: {
          formatGuidedRightsStatement(
            symbol,
            parts.year,
            parts.holder,
          ) || "Blank"
        }
      </small>
    </span>
  );
}

function isMultilineLyricsPath(
  path: string,
): boolean {
  return /^track\.text\.(lyrics|synchronized_lyrics|unsynchronized_lyrics|translation)$/.test(
    path,
  );
}

type MetadataProvenanceKind =
  | "stored"
  | "inherited"
  | "generated";

function MetadataProvenanceChip({
  kind,
  detail,
}: {
  kind: MetadataProvenanceKind;
  detail: string;
}) {
  const label =
    kind === "stored"
      ? "Stored"
      : kind === "inherited"
        ? "Inherited"
        : "Generated";

  return (
    <span
      className={`metadata-provenance-chip is-${kind}`}
      data-provenance={kind}
      title={detail}
      aria-label={`${label} provenance: ${detail}`}
    >
      {label}
    </span>
  );
}

function MetadataValueCell({
  document,
  row,
  field,
  inheritedValue,
  inheritedSourcePath,
  generatedFallbackValue,
  generatedFallbackNote,
  editMode,
  draft,
  onDraftValueChange,
}: {
  document: ParsedMetadataDocument;
  row: FlattenedMetadataRow;
  field?: MetadataFieldDefinition;
  inheritedValue?: EditableMetadataValue;
  inheritedSourcePath?: string;
  generatedFallbackValue?: EditableMetadataValue;
  generatedFallbackNote?: string;
  editMode: boolean;
  draft: MetadataDraft;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
}) {
  if (!isEditableMetadataValue(row.value)) {
    return (
      <span className="metadata-value readonly-complex">
        <span>{formatMetadataValue(row.value)}</span>
        <span className="metadata-value-provenance">
          <MetadataProvenanceChip
            kind="stored"
            detail={`Stored in ${document.filename} at ${row.path}`}
          />
        </span>
      </span>
    );
  }

  const originalValue = row.value;
  const usingInheritedValue =
    inheritedValue !== undefined &&
    isBlankMetadataValue(originalValue);

  const generatedSortTitle =
    row.path === "track.sort_title" &&
    typeof originalValue === "string" &&
    !originalValue.trim()
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
  const internallyGeneratedValue =
    row.path === "track.display_title" &&
    typeof originalValue === "string" &&
    !originalValue.trim()
      ? formatTrackDisplayTitle(
          readDocumentDraftString(document, "track.title", draft),
          readDocumentDraftString(document, "track.version", draft),
        )
      : row.path === "track.audio.camelot_key" &&
          typeof originalValue === "string" &&
          !originalValue.trim()
        ? camelotKeyForMusicalKey(
            readDocumentDraftString(document, "track.audio.key", draft),
          ) ?? ""
        : generatedSortTitle?.value ?? "";
  const internallyGeneratedNote =
    row.path === "track.audio.camelot_key"
      ? "Generated from Key"
      : row.path === "track.sort_title"
        ? generatedSortTitle?.source
          ? `Generated from ${generatedSortTitle.source}`
          : ""
        : "Generated from Track Title";
  const usingInternallyGeneratedValue =
    Boolean(internallyGeneratedValue);

  const effectiveValue = usingInheritedValue
    ? inheritedValue
    : usingInternallyGeneratedValue
      ? internallyGeneratedValue
      : originalValue;

  const draftKey = buildDocumentDraftKey(
    document,
    row.path,
  );
  const changed =
    Object.prototype.hasOwnProperty.call(
      draft,
      draftKey,
    );
  const authoredCurrentValue = changed
    ? draft[draftKey]
    : effectiveValue;
  const usingFallbackGeneratedValue =
    generatedFallbackValue !== undefined &&
    !isBlankMetadataValue(
      generatedFallbackValue,
    ) &&
    isBlankMetadataValue(
      authoredCurrentValue,
    );
  const usingGeneratedValue =
    usingInternallyGeneratedValue ||
    usingFallbackGeneratedValue;
  const generatedNote =
    usingFallbackGeneratedValue
      ? generatedFallbackNote ?? "Generated value"
      : internallyGeneratedNote;
  const currentValue =
    usingFallbackGeneratedValue
      ? generatedFallbackValue
      : authoredCurrentValue;
  const guidedNoticeDisplayValue =
    typeof currentValue === "string"
      ? formatGuidedCopyrightNoticeValue(
          row.path,
          currentValue,
        )
      : null;
  const displayCurrentValue =
    guidedNoticeDisplayValue ?? currentValue;

  const usesGuardedReleaseIdentity =
    document.scope === "release" &&
    row.path === "release.id";

  if (editMode && usesGuardedReleaseIdentity) {
    return (
      <span className="metadata-value guarded-release-identity">
        <span>{formatMetadataValue(displayCurrentValue)}</span>
        <small className="metadata-provenance-note">
          Use Release identity &amp; directory from the release menu so the
          folder, references, receipt, and release ID stay synchronized.
        </small>
      </span>
    );
  }

  if (!editMode) {
    return (
      <span
        className={[
          isBlankMetadataValue(currentValue)
            ? "metadata-value blank"
            : "metadata-value",
          changed ? "draft-changed" : "",
          isMultilineLyricsPath(row.path)
            ? "multiline-metadata-value"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span>
          {row.path === "track.audio.tuning_hz" && typeof displayCurrentValue === "number"
            ? `${formatMetadataValue(displayCurrentValue)} Hz`
            : formatMetadataValue(displayCurrentValue)}
        </span>

        {!isBlankMetadataValue(currentValue) && (
          <span className="metadata-value-provenance">
            {usingInheritedValue ? (
              <MetadataProvenanceChip
                kind="inherited"
                detail={
                  inheritedSourcePath
                    ? `Inherited from ${inheritedSourcePath}`
                    : "Inherited from release metadata"
                }
              />
            ) : usingGeneratedValue ? (
              <MetadataProvenanceChip
                kind="generated"
                detail={generatedNote || "Generated value"}
              />
            ) : (
              <MetadataProvenanceChip
                kind="stored"
                detail={`Stored in ${document.filename} at ${row.path}`}
              />
            )}
          </span>
        )}
      </span>
    );
  }

  if (
    Array.isArray(originalValue) ||
    Array.isArray(effectiveValue)
  ) {
    const currentArray = Array.isArray(
      currentValue,
    )
      ? currentValue
      : Array.isArray(effectiveValue)
        ? effectiveValue
        : [];

    return (
      <label className="metadata-editor-field array-field">
        <textarea
          rows={Math.max(
            3,
            currentArray.length + 1,
          )}
          value={stringArrayToEditorText(
            currentArray,
          )}
          placeholder="One value per line"
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              editorTextToStringArray(
                event.target.value,
              ),
            )
          }
          onBlur={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              normalizeStringArrayEditorValue(
                event.target.value,
              ),
            )
          }
        />

        <span className="array-field-help">
          One value per line
        </span>

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            Track override
          </span>
        )}
      </label>
    );
  }

  if (
    typeof originalValue === "boolean" ||
    typeof effectiveValue === "boolean"
  ) {
    return (
      <label className="metadata-editor-field boolean-field">
        <select
          value={String(currentValue)}
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value === "true",
            )
          }
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            Track override
          </span>
        )}
      </label>
    );
  }

  if (
    typeof originalValue === "number" ||
    typeof effectiveValue === "number"
  ) {
    return (
      <label className="metadata-editor-field">
        <span className={row.path === "track.audio.tuning_hz" ? "metadata-number-with-unit" : undefined}>
        <input
          type="number"
          min={row.path === "track.audio.tuning_hz" ? 100 : isTrackDiscNumberingPath(row.path) ? 1 : undefined}
          max={row.path === "track.audio.tuning_hz" ? 999 : undefined}
          step={isTrackDiscNumberingPath(row.path) ? 1 : row.path === "track.audio.tuning_hz" ? 0.1 : "any"}
          value={String(currentValue)}
          onChange={(event) => {
            const parsed =
              parseDraftNumber(
                event.target.value,
              );

            if (
              parsed !== null &&
              (row.path !== "track.audio.tuning_hz" || isValidTuningReference(parsed))
            ) {
              onDraftValueChange(
                document,
                row.path,
                originalValue,
                parsed,
              );
            }
          }}
        />
        {row.path === "track.audio.tuning_hz" && <span className="metadata-value-unit">Hz</span>}
        </span>

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            Track override
          </span>
        )}
      </label>
    );
  }

  const multilineEditor =
    field?.editor?.control === "multiline"
      ? field.editor
      : null;

  if (
    typeof currentValue === "string" &&
    multilineEditor
  ) {
    const wordCount =
      currentValue.trim()
        ? currentValue.trim().split(/\s+/).length
        : 0;
    const isReleaseDescription =
      document.scope === "release" &&
      row.path === "release.description";

    return (
      <div className="metadata-editor-field metadata-multiline-field">
        {isReleaseDescription && (
          <Suspense
            fallback={
              <span className="metadata-multiline-help">
                Loading Release About Generator…
              </span>
            }
          >
            <LazyReleaseAboutGenerator
              artistName={readDocumentDraftString(
                document,
                "release.primary_artist.name",
                draft,
              )}
              releaseTitle={readDocumentDraftString(
                document,
                "release.title",
                draft,
              )}
              currentDescription={currentValue}
              profileStorageKey={document.relativePath}
              editorialSnapshot={readReleaseEditorialSnapshot(
                document,
                draft,
              )}
              onEditorialSnapshotChange={(nextSnapshot) => {
                const originalSnapshot =
                  readReleaseEditorialSnapshot(
                    document,
                    {},
                  );

                for (
                  const entry of
                    releaseEditorialSnapshotEntries(
                      nextSnapshot,
                    )
                ) {
                  onDraftValueChange(
                    document,
                    entry.path,
                    releaseEditorialSnapshotValue(
                      originalSnapshot,
                      entry.path,
                    ),
                    entry.value,
                  );
                }
              }}
              onUse={(generatedDescription) =>
                onDraftValueChange(
                  document,
                  row.path,
                  originalValue,
                  generatedDescription,
                )
              }
            />
          </Suspense>
        )}

        <textarea
          rows={multilineEditor.rows ?? 6}
          maxLength={multilineEditor.maxLength}
          value={currentValue}
          placeholder={multilineEditor.placeholder}
          spellCheck="true"
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value,
            )
          }
        />

        <span className="metadata-multiline-help">
          {multilineEditor.help ?? "Multiline text"}
          {" · "}
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>

        {changed && (
          <span className="changed-indicator">
            Modified
          </span>
        )}
      </div>
    );
  }

  if (
    typeof currentValue === "string" &&
    isMultilineLyricsPath(row.path)
  ) {
    const lineCount =
      currentValue.split("\n").length;

    return (
      <label className="metadata-editor-field multiline-lyrics-field">
        <textarea
          rows={Math.min(
            24,
            Math.max(12, lineCount + 2),
          )}
          value={currentValue}
          placeholder="Enter complete lyrics with one lyrical line per line. Use a blank line between stanzas."
          spellCheck="true"
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value,
            )
          }
        />

        <span className="multiline-lyrics-help">
          Preserve intentional line and stanza breaks.
        </span>

        {changed && (
          <span className="changed-indicator">
            Modified
          </span>
        )}
      </label>
    );
  }

  if (
    typeof currentValue === "string" &&
    isGuidedCopyrightNoticePath(row.path)
  ) {
    return (
      <div className="metadata-editor-field guided-rights-field">
        <CopyrightNoticeInput
          path={row.path}
          value={currentValue}
          onChange={(nextValue) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              nextValue,
            )
          }
        />

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            {usingInheritedValue
              ? "Track override"
              : "Modified"}
          </span>
        )}
      </div>
    );
  }

  const rightsStatementSymbol =
    typeof currentValue === "string"
      ? getRightsStatementSymbol(row.path)
      : null;

  if (
    rightsStatementSymbol &&
    typeof currentValue === "string"
  ) {
    return (
      <div className="metadata-editor-field guided-rights-field">
        <GuidedRightsStatementInput
          path={row.path}
          symbol={rightsStatementSymbol}
          value={currentValue}
          onChange={(nextValue) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              nextValue,
            )
          }
        />

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            {usingInheritedValue
              ? "Track override"
              : "Modified"}
          </span>
        )}
      </div>
    );
  }

  const usesCalendarDateInput =
    typeof currentValue === "string" &&
    isCalendarDateMetadataPath(
      row.path,
      field?.valueType,
    );

  if (usesCalendarDateInput) {
    const calendarValue =
      getCalendarInputValue(currentValue);
    const legacyDateValue =
      getLegacyCalendarDateValue(currentValue);
    const supportsDateReleaseValue =
      inheritedValue !== undefined;
    const restoreDateReleaseValuePending =
      supportsDateReleaseValue &&
      changed &&
      isBlankMetadataValue(currentValue);
    const showUseDateReleaseValue =
      supportsDateReleaseValue &&
      (changed || !isBlankMetadataValue(originalValue));

    return (
      <label className="metadata-editor-field metadata-date-field">
        <input
          type="date"
          value={calendarValue}
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value,
            )
          }
        />

        {legacyDateValue && (
          <small className="metadata-provenance-note metadata-legacy-date-note">
            Existing value: {legacyDateValue}. Select a complete calendar date to replace it.
          </small>
        )}

        {supportsDateReleaseValue && (
          <span className="metadata-inheritance-actions">
            <small className="metadata-provenance-note metadata-inherited-note">
              Release value: {formatMetadataValue(inheritedValue)}
            </small>

            {showUseDateReleaseValue && (
              <button
                type="button"
                className="metadata-use-release-value-button"
                disabled={restoreDateReleaseValuePending}
                onClick={() =>
                  onDraftValueChange(
                    document,
                    row.path,
                    originalValue,
                    "",
                  )
                }
              >
                {restoreDateReleaseValuePending
                  ? "Release value selected"
                  : "Use release value"}
              </button>
            )}
          </span>
        )}

        {usingGeneratedValue && !changed && (
          <span className="metadata-provenance-note metadata-derived-note">
            {generatedNote}
          </span>
        )}

        {usingInheritedValue && !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            {restoreDateReleaseValuePending
              ? "Restore release value"
              : usingInheritedValue
                ? "Track override"
                : "Modified"}
          </span>
        )}
      </label>
    );
  }

  const controlledVocabulary =
    field?.editor?.control ===
      "select-or-custom" &&
    typeof currentValue === "string"
      ? {
          editor: field.editor,
          value: currentValue,
        }
      : null;

  if (controlledVocabulary) {
    const supportsTrackLanguageDefault =
      row.path ===
        "track.text.lyrics_language" &&
      typeof generatedFallbackValue ===
        "string" &&
      Boolean(generatedFallbackValue.trim());
    const restoreTrackLanguagePending =
      supportsTrackLanguageDefault &&
      changed &&
      isBlankMetadataValue(
        draft[draftKey],
      ) &&
      !isBlankMetadataValue(
        originalValue,
      );
    const showUseTrackLanguage =
      supportsTrackLanguageDefault &&
      (
        changed ||
        !isBlankMetadataValue(
          originalValue,
        )
      );

    return (
      <label className="metadata-editor-field controlled-vocabulary-field">
        <SelectOrCustomMetadataInput
          value={controlledVocabulary.value}
          options={
            controlledVocabulary.editor.options
          }
          selectLabel={`Select ${field?.label ?? row.path}`}
          customLabel={
            controlledVocabulary.editor.customLabel
          }
          customPlaceholder={
            controlledVocabulary.editor.customPlaceholder
          }
          onChange={(nextValue) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              nextValue,
            )
          }
        />

        {showUseTrackLanguage && (
          <span className="metadata-inheritance-actions">
            <small className="metadata-provenance-note metadata-derived-note">
              Track Language: {generatedFallbackValue}
            </small>

            <button
              type="button"
              className="metadata-use-release-value-button"
              disabled={restoreTrackLanguagePending}
              onClick={() =>
                onDraftValueChange(
                  document,
                  row.path,
                  originalValue,
                  "",
                )
              }
            >
              {restoreTrackLanguagePending
                ? "Track Language selected"
                : "Use Track Language"}
            </button>
          </span>
        )}

        {usingGeneratedValue && (
          <span className="metadata-provenance-note metadata-derived-note">
            {generatedNote}
          </span>
        )}

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            {restoreTrackLanguagePending
              ? "Use Track Language"
              : usingInheritedValue
                ? "Track override"
                : supportsTrackLanguageDefault
                  ? "Local override"
                  : "Modified"}
          </span>
        )}
      </label>
    );
  }

  if (
    row.path === "track.display_title" &&
    typeof currentValue === "string"
  ) {
    const localTrackTitle =
      readDocumentDraftString(
        document,
        "track.title",
        draft,
      );
    const localTrackVersion =
      readDocumentDraftString(
        document,
        "track.version",
        draft,
      );
    const generatedDisplayTitle =
      formatTrackDisplayTitle(
        localTrackTitle,
        localTrackVersion,
      );
    const matchesGeneratedTitle =
      currentValue.trim() ===
      generatedDisplayTitle;

    return (
      <label className="metadata-editor-field track-display-title-field">
        <input
          type="text"
          value={currentValue}
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value,
            )
          }
        />

        {generatedDisplayTitle && (
          <span className="track-display-title-suggestion">
            <span>
              Suggested: {generatedDisplayTitle}
            </span>

            <button
              type="button"
              disabled={matchesGeneratedTitle}
              onClick={() =>
                onDraftValueChange(
                  document,
                  row.path,
                  originalValue,
                  generatedDisplayTitle,
                )
              }
            >
              {matchesGeneratedTitle
                ? "Using generated title"
                : "Use generated title"}
            </button>
          </span>
        )}

        <small className="metadata-provenance-note metadata-derived-note track-display-title-help">
          Generated from Track Title plus the local Track Version. It stays synchronized while using the generated wording; an individual custom title remains unchanged.
        </small>

        {changed && (
          <span className="changed-indicator">
            Modified
          </span>
        )}
      </label>
    );
  }

  const supportsReleaseValueInheritance =
    inheritedValue !== undefined;
  const restoreReleaseValuePending =
    supportsReleaseValueInheritance &&
    changed &&
    isBlankMetadataValue(currentValue);
  const showUseReleaseValue =
    supportsReleaseValueInheritance &&
    (
      changed ||
      !isBlankMetadataValue(originalValue)
    );

  return (
    <label className="metadata-editor-field">
      <input
        type="text"
        value={String(currentValue)}
        onChange={(event) =>
          onDraftValueChange(
            document,
            row.path,
            originalValue,
            event.target.value,
          )
        }
      />

      {supportsReleaseValueInheritance && (
        <span className="metadata-inheritance-actions">
          <small className="metadata-provenance-note metadata-inherited-note">
            Release value: {formatMetadataValue(inheritedValue)}
          </small>

          {showUseReleaseValue && (
            <button
              type="button"
              className="metadata-use-release-value-button"
              disabled={restoreReleaseValuePending}
              onClick={() =>
                onDraftValueChange(
                  document,
                  row.path,
                  originalValue,
                  "",
                )
              }
            >
              {restoreReleaseValuePending
                ? "Release value selected"
                : "Use release value"}
            </button>
          )}
        </span>
      )}

      {usingGeneratedValue &&
        !changed && (
        <span className="metadata-provenance-note metadata-derived-note">
          {generatedNote}
        </span>
      )}

      {usingInheritedValue &&
        !changed && (
        <span className="metadata-provenance-note metadata-inherited-note">
          Inherited from release
        </span>
      )}

      {changed && (
        <span className="changed-indicator">
          {restoreReleaseValuePending
            ? "Restore release value"
            : usingInheritedValue
              ? "Track override"
              : "Modified"}
        </span>
      )}
    </label>
  );
}

function metadataRowMatchesTab(
  path: string,
  group: string,
  tab: ReleaseMetadataTab,
): boolean {
  const lowerPath = path.toLowerCase();

  if (tab === "raw") {
    return false;
  }

  if (tab === "settings") {
    return true;
  }

  if (tab === "files") {
    return group === "Files and Sources";
  }

  if (tab === "developer") {
    return group === "Developer / Advanced";
  }

  if (tab === "artwork") {
    return group === "Artwork";
  }

  const isLyricsRelated =
    [
      "Language & Writing System",
      "Lyrics",
      "Lyrics Rights & Source",
    ].includes(group) ||
    (
      /(^|\.)(lyrics?|language|script|translation)(\.|\[|$)/.test(
        lowerPath,
      ) ||
      /^track\.text\.(synchronized_lyrics|unsynchronized_lyrics)(\.|\[|$)/.test(
        lowerPath,
      )
    );

  const isWritingCredit =
    /(^|\.)(composer|composers|songwriter|songwriters|lyricist|lyricists|written_by|music_by|words_by)(\.|\[|$)/.test(
      lowerPath,
    );

  if (tab === "lyrics") {
    return isLyricsRelated;
  }

  if (tab === "credits") {
    return (
      group === "Artists" ||
      group === "Performers" ||
      group === "Songwriting & Composition" ||
      group === "Samples & Interpolations" ||
      group === "Arrangement & Orchestration" ||
      group === "Conducting & Musical Direction" ||
      isWritingCredit
    );
  }

  if (tab === "recording") {
    return [
      "Production",
      "Recording",
      "Editing",
      "Mixing",
      "Mastering",
      "Technical Audio",
    ].includes(group);
  }

  if (tab === "rights") {
    return (
      group === "Music Business & Rights" ||
      group === "Sample Clearance"
    );
  }

  if (tab === "notes") {
    return metadataRowMatchesNotesTab(
      lowerPath,
      group,
    );
  }

  return ![
    "Artists",
    "Performers",
    "Songwriting & Composition",
    "Samples & Interpolations",
    "Writing, Lyrics & Language",
    "Language & Writing System",
    "Lyrics",
    "Lyrics Rights & Source",
    "Arrangement & Orchestration",
    "Conducting & Musical Direction",
    "Production",
    "Recording",
    "Editing",
    "Mixing",
    "Mastering",
    "Technical Audio",
    "Music Business & Rights",
    "Sample Clearance",
    "Artwork",
    "Text and Notes",
    "Files and Sources",
    "Developer / Advanced",
  ].includes(group) &&
    !isLyricsRelated &&
    !isWritingCredit;
}

type ReleaseContributorRowItem = {
  row: FlattenedMetadataRow;
  fieldDefinition:
    | MetadataFieldDefinition
    | undefined;
  group: string;
  sourceIndex: number;
  startsGroup: boolean;
};

type ReleaseContributorRecord = {
  index: number;
  rows: ReleaseContributorRowItem[];
};

const engineeringContributorGroups =
  new Set([
    "Recording",
    "Editing",
    "Mixing",
    "Mastering",
  ]);

const engineeringCreditSummaryGroup =
  "Recording, Mixing & Mastering Credits";

function getTrackContributorRecordIndex(
  path: string,
): number | null {
  const match = path.match(
    /^track\.contributors\[(\d+)\]\./,
  );

  if (!match) {
    return null;
  }

  const parsedIndex = Number.parseInt(
    match[1] ?? "",
    10,
  );

  return Number.isInteger(parsedIndex)
    ? parsedIndex
    : null;
}

function getReleaseContributorRecordIndex(
  path: string,
): number | null {
  const match = path.match(
    /^release\.credits\.contributors\[(\d+)\]\./,
  );

  if (!match) {
    return null;
  }

  const parsedIndex = Number.parseInt(
    match[1] ?? "",
    10,
  );

  return Number.isInteger(parsedIndex)
    ? parsedIndex
    : null;
}

function getReleaseContributorLeaf(
  path: string,
): string {
  return path.split(".").at(-1) ?? path;
}

function getContributorFieldLabel(
  leaf: string,
): string {
  switch (leaf) {
    case "name":
      return "Name";
    case "role":
      return "Role";
    case "sort_name":
      return "Sort name";
    default:
      return leaf
        .replaceAll("_", " ")
        .replace(
          /\b\w/g,
          (character) =>
            character.toUpperCase(),
        );
  }
}

function getInitialMetadataFieldValue(
  field: MetadataFieldDefinition,
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
  releaseDocuments: ParsedMetadataDocument[] = [],
): EditableMetadataValue {
  if (field.tomlPath === "track.text.lyrics_language") {
    const releaseLanguageValue =
      findMetadataValueAcrossDocuments(
        releaseDocuments,
        "release.language",
      );
    const effectiveTrackLanguage =
      resolveEffectiveTrackLanguage({
        trackLanguage: readDocumentDraftString(
          document,
          "track.language",
          draft,
        ),
        releaseLanguage:
          typeof releaseLanguageValue === "string"
            ? releaseLanguageValue
            : "",
      });

    return effectiveTrackLanguage.value;
  }
  if (field.tomlPath === "track.audio.time_signature") return "4/4";
  if (field.tomlPath === "track.audio.tuning_hz") return 440;
  if (field.tomlPath === "track.audio.camelot_key") {
    return camelotKeyForMusicalKey(
      readDocumentDraftString(document, "track.audio.key", draft),
    ) ?? "";
  }
  if (field.tomlPath === "track.display_title") {
    return formatTrackDisplayTitle(
      readDocumentDraftString(document, "track.title", draft),
      readDocumentDraftString(document, "track.version", draft),
    );
  }
  if (isLicenseMetadataPath(field.tomlPath)) {
    return defaultLicenseValue;
  }
  if (field.tomlPath === "track.sort_title") {
    return generateTrackSortTitle({
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
    }).value;
  }

  const artistNamePath =
    artistNamePathForSortNamePath(
      field.tomlPath,
    );

  if (artistNamePath) {
    return generateArtistSortName(
      readDocumentDraftString(
        document,
        artistNamePath,
        draft,
      ),
    ).value;
  }

  switch (field.valueType) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "string-array":
      return [];
    default:
      return "";
  }
}

function metadataStorageRoleForFilename(
  filename: string,
): string {
  const roles: Record<string, string> = {
    "release.toml": "release",
    "release-settings.toml":
      "release-settings",
    "release-production-notes.toml":
      "release-production-notes",
    "track.toml": "track",
    "track-credits.toml":
      "track-credits",
    "track-production-notes.toml":
      "track-production-notes",
  };

  return roles[filename] ?? "";
}

function buildDocumentMetadataRegistry(
  document: ParsedMetadataDocument,
  metadataRegistry: MetadataFieldDefinition[],
): MetadataFieldDefinition[] {
  if (
    document.filename !== "release-production-notes.toml" &&
    document.filename !== "track-production-notes.toml"
  ) {
    return metadataRegistry;
  }

  const storageFileRole =
    metadataStorageRoleForFilename(
      document.filename,
    );
  const existingPaths = new Set(
    metadataRegistry.map(
      (field) => field.tomlPath,
    ),
  );
  const supplemental = productionContextFields
    .filter(
      (field) => !existingPaths.has(field.path),
    )
    .map(
      (field): MetadataFieldDefinition => ({
        id: `${document.scope}.${field.path}`,
        canonicalName: `${document.scope}.${field.path}`,
        label: field.label,
        description: field.help,
        scope: document.scope,
        storageFileRole,
        tomlPath: field.path,
        valueType: field.valueType ?? "string",
        required: false,
        repeatable: false,
        inherited:
          document.scope === "track",
        presentation: {
          group: field.group,
          order: field.order,
          examples: field.examples,
          help: field.help,
        },
        displayPolicy: "auto",
      }),
    );

  return [
    ...metadataRegistry,
    ...supplemental,
  ];
}

export {
  MetadataDocumentSection,
  playerCompatibilityLabels,
  MetadataCompatibilityNotes,
  controlledVocabularyOtherValue,
  findControlledVocabularyOption,
  SelectOrCustomMetadataInput,
  CopyrightNoticeInput,
  GuidedRightsStatementInput,
  isMultilineLyricsPath,
  type MetadataProvenanceKind,
  MetadataProvenanceChip,
  MetadataValueCell,
  metadataRowMatchesTab,
  type ReleaseContributorRowItem,
  type ReleaseContributorRecord,
  engineeringContributorGroups,
  engineeringCreditSummaryGroup,
  getTrackContributorRecordIndex,
  getReleaseContributorRecordIndex,
  getReleaseContributorLeaf,
  getContributorFieldLabel,
  getInitialMetadataFieldValue,
  metadataStorageRoleForFilename,
  buildDocumentMetadataRegistry,
};
