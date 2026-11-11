import {
  getArrangementCreditDisplayPriority,
  isArrangementContributorRoleValue,
  sortArrangementCreditDisplayRecords,
} from "../arrangement-credit-role.js";
import {
  getWritingCreditDisplayPriority,
  sortWritingCreditDisplayRecords,
  writingCreditFamilyForRole,
  writingCreditRoleOptions,
  type WritingCreditFamily,
} from "../writing-credit-role.js";
import {
  isTechnicalContributorRoleValue,
  getTechnicalCreditDisplayPriority,
  sortTechnicalCreditDisplayRecords,
} from "../technical-credit-role.js";
import {
  groupMatchingPerformerRoleSets,
  prioritizeReleaseArtistDisplay,
} from "../performer-display-order.js";
import { resolveCreditSortName } from "../credit-sort-name.js";
import {
  type GroupedPersonRoleDisplay,
  type PerformerRecordDraft,
  type WritingCreditRecordDraft,
  applyCreditRecordUpdates,
  arrangementCreditOverrideKey,
  findRegisteredMetadataField,
  getArrangementContributorPath,
  getTechnicalContributorPath,
  getWritingCreditBasePath,
  groupPersonRoleDisplayRecords,
  sortGroupedPerformerRoleDisplays,
  technicalCreditOverrideKey,
} from "./metadata-records.js";
import {
  MetadataFieldControls,
  MetadataFieldPairControls,
} from "./metadata-field-guidance.js";
import type {
  MetadataFieldDefinition,
  ParsedMetadataDocument,
} from "./types.js";
import {
  SelectOrCustomMetadataInput,
} from "./metadata-value-cells.js";

function PerformerRecordEditor({
  document,
  records,
  releasePrimaryArtistName,
  releaseDefaultRecords = [],
  inheritedFromRelease = false,
  editMode,
  metadataRegistry,
  relatedOpen,
  onRelatedToggle,
  onChange,
  onCustomizeTrack,
  onUseRelease,
}: {
  document: ParsedMetadataDocument;
  records: PerformerRecordDraft[];
  releasePrimaryArtistName: string;
  releaseDefaultRecords?: PerformerRecordDraft[];
  inheritedFromRelease?: boolean;
  editMode: boolean;
  metadataRegistry: MetadataFieldDefinition[];
  relatedOpen: boolean;
  onRelatedToggle: (
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => void;
  onChange: (
    records: PerformerRecordDraft[],
  ) => void;
  onCustomizeTrack?: () => void;
  onUseRelease?: () => void;
}) {
  const performerBasePath =
    document.scope === "release"
      ? "release.credits.performers"
      : "track.performers";
  const roleField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${performerBasePath}[0].role`,
    );
  const sortNameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${performerBasePath}[0].sort_name`,
    );
  const canEditRecords =
    editMode && !inheritedFromRelease;
  const performanceRoleOptions =
    roleField?.editor?.options ??
    roleField?.presentation?.commonValues ??
    [];

  const updateRecord = (
    recordIndex: number,
    updates: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    onChange(
      records.map(
        (record, index) =>
          index === recordIndex
            ? applyCreditRecordUpdates<
                PerformerRecordDraft
              >(
                record,
                updates,
              )
            : record,
      ),
    );
  };

  const addRecord = () => {
    if (records.length >= 500) {
      return;
    }

    onChange([
      ...records,
      {
        key: [
          "new",
          Date.now(),
          records.length,
        ].join("-"),
        sourceIndex: null,
        name: "",
        role: "",
        sortName: "",
      },
    ]);
  };

  const removeRecord = (
    recordIndex: number,
  ) => {
    const record =
      records[recordIndex];

    if (!record) {
      return;
    }

    const hasContent = [
      record.name,
      record.role,
      record.sortName,
    ].some(
      (value) =>
        value.trim().length > 0,
    );

    if (
      hasContent &&
      !window.confirm(
        `Remove performer ${
          record.name.trim() ||
          recordIndex + 1
        } and the paired performance role?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (_, index) =>
          index !== recordIndex,
      ),
    );
  };

  const personGroupedRecords =
    prioritizeReleaseArtistDisplay(
      sortGroupedPerformerRoleDisplays(
        groupPersonRoleDisplayRecords(
          records.map((record) => ({
            key: record.key,
            name: record.name,
            role: record.role,
            sortName: record.sortName,
          })),
        ),
      ),
      releasePrimaryArtistName,
    );
  const groupedRecords =
    groupMatchingPerformerRoleSets(
      personGroupedRecords,
      releasePrimaryArtistName,
    );
  const showSortNames =
    canEditRecords
      ? records.some(
          (record) =>
            record.sortName.trim(),
        ) || records.length > 0
      : personGroupedRecords.some(
          (record) =>
            record.sortNames.length > 0,
        );
  const incompleteCount =
    records.filter(
      (record) =>
        !record.name.trim() ||
        !record.role.trim(),
    ).length;

  return (
    <div className="performer-record-editor">
      {inheritedFromRelease && (
        <div className="performer-inheritance-banner">
          <div>
            <strong>Inherited from release</strong>
            <p>
              This track uses the release performer baseline. Customize it only when this track differs.
            </p>
          </div>
          {editMode && onCustomizeTrack && (
            <button
              type="button"
              className="performer-add-button"
              onClick={onCustomizeTrack}
            >
              Customize performers for this track
            </button>
          )}
        </div>
      )}

      {canEditRecords && (
        <div className="performer-record-toolbar">
          {incompleteCount > 0 ? (
            <p className="performer-validation-message">
              {incompleteCount} incomplete{" "}
              {incompleteCount === 1
                ? "record needs"
                : "records need"}{" "}
              both a name and role before saving.
            </p>
          ) : (
            <span aria-hidden="true" />
          )}

          <div className="performer-record-toolbar-actions">
            {document.scope === "track" &&
              releaseDefaultRecords.length > 0 &&
              onUseRelease && (
                <button
                  type="button"
                  className="metadata-section-copy-button"
                  onClick={onUseRelease}
                >
                  Use release performers
                </button>
              )}

            <button
              type="button"
              className="performer-add-button"
              disabled={records.length >= 500}
              onClick={addRecord}
            >
              <span aria-hidden="true">+</span>
              <span>Add performer</span>
            </button>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="performer-empty-state">
          <p>
            No performers have been added.
          </p>

          {canEditRecords && (
            <button
              type="button"
              className="performer-add-button"
              onClick={addRecord}
            >
              <span aria-hidden="true">+</span>
              <span>Add first performer</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            className={[
              "performer-record-column-headings",
              !canEditRecords
                ? "is-read-only"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div>
              <strong>Name</strong>
            </div>

            <div>
              <strong>Performance role</strong>
            </div>

            {canEditRecords && (
              <span className="sr-only">
                Record actions
              </span>
            )}
          </div>

          <div className="performer-record-list">
            {canEditRecords
              ? records.map(
                  (record, recordIndex) => (
                    <div
                      key={record.key}
                      className={[
                        "performer-record-row",
                        !record.name.trim() ||
                        !record.role.trim()
                          ? "is-incomplete"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <label>
                        <span className="sr-only">
                          Performer{" "}
                          {recordIndex + 1} name
                        </span>
                        <input
                          type="text"
                          value={record.name}
                          aria-invalid={
                            !record.name.trim()
                          }
                          placeholder="Performer name"
                          onChange={(event) =>
                            updateRecord(
                              recordIndex,
                              {
                                name:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      </label>

                      <label>
                        <span className="sr-only">
                          Performer{" "}
                          {recordIndex + 1} role
                        </span>
                        <SelectOrCustomMetadataInput
                          value={record.role}
                          options={
                            performanceRoleOptions
                          }
                          selectLabel={`Select performer ${recordIndex + 1} role`}
                          customPlaceholder="Custom performance role"
                          ariaInvalid={
                            !record.role.trim()
                          }
                          onChange={(nextRole) =>
                            updateRecord(
                              recordIndex,
                              {
                                role: nextRole,
                              },
                            )
                          }
                        />
                      </label>

                      <button
                        type="button"
                        className="performer-remove-button"
                        tabIndex={-1}
                        aria-label={`Remove performer ${recordIndex + 1}`}
                        title="Remove performer and role"
                        onClick={() =>
                          removeRecord(
                            recordIndex,
                          )
                        }
                      >
                        <span aria-hidden="true">
                          −
                        </span>
                      </button>
                    </div>
                  ),
                )
              : groupedRecords.map(
                  (record) => (
                    <div
                      key={record.key}
                      className="performer-record-row is-read-only is-grouped-display"
                    >
                      <span>
                        {record.name ||
                          "(name not entered)"}
                      </span>
                      <span>
                        {record.roles.length > 0
                          ? record.roles.join(", ")
                          : "(role not entered)"}
                      </span>
                    </div>
                  ),
                )}
          </div>

        </>
      )}

      {showSortNames &&
        records.length > 0 && (
        <details
          className="metadata-related-tags performer-related-tags"
          open={relatedOpen}
          onToggle={onRelatedToggle}
        >
          <summary>
            <span
              className="metadata-section-triangle"
              aria-hidden="true"
            />
            <span>Related tags</span>
          </summary>

          <div className="performer-sort-name-list">
            <header>
              <strong>
                Performer sort names
              </strong>
              <MetadataFieldControls
                field={sortNameField}
                path={`${performerBasePath}[].sort_name`}
                valueType="string"
              />
            </header>

            {canEditRecords
              ? records.map(
                  (record, recordIndex) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          `Performer ${recordIndex + 1}`}
                      </span>

                      <input
                        type="text"
                        value={record.sortName}
                        placeholder="Last, First"
                        onChange={(event) =>
                          updateRecord(
                            recordIndex,
                            {
                              sortName:
                                event.target.value,
                            },
                          )
                        }
                      />
                    </label>
                  ),
                )
              : personGroupedRecords
                  .filter(
                    (record) =>
                      record.sortNames.length > 0,
                  )
                  .map((record) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          "(name not entered)"}
                      </span>
                      <span>
                        {record.sortNames.join(", ")}
                      </span>
                    </label>
                  ))}
          </div>
        </details>
      )}
    </div>
  );
}

function WritingCreditRecordEditor({
  document,
  records,
  inheritedRecords = [],
  releaseDefaultRecords = [],
  editMode,
  metadataRegistry,
  relatedOpen,
  onRelatedToggle,
  onChange,
}: {
  document: ParsedMetadataDocument;
  records: WritingCreditRecordDraft[];
  inheritedRecords?: WritingCreditRecordDraft[];
  releaseDefaultRecords?: WritingCreditRecordDraft[];
  editMode: boolean;
  metadataRegistry: MetadataFieldDefinition[];
  relatedOpen: boolean;
  onRelatedToggle: (
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => void;
  onChange: (
    records: WritingCreditRecordDraft[],
  ) => void;
}) {
  const basePath = getWritingCreditBasePath(document);
  const nameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${basePath}.composers[0].name`,
    ) ??
    findRegisteredMetadataField(
      metadataRegistry,
      `${basePath}.songwriters[0].name`,
    );
  const roleField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${basePath}.songwriters[0].role`,
    );
  const sortNameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${basePath}.songwriters[0].sort_name`,
    );
  const isReleaseCreditEditor =
    document.scope === "release";

  const updateRecord = (
    recordIndex: number,
    updates: Partial<
      Pick<
        WritingCreditRecordDraft,
        "name" | "role" | "sortName" | "family"
      >
    >,
  ) => {
    onChange(
      records.map((record, index) => {
        if (index !== recordIndex) {
          return record;
        }

        const nextRole =
          updates.role ?? record.role;
        const nextFamily =
          updates.family ??
          writingCreditFamilyForRole(
            nextRole,
            record.family,
          );

        return applyCreditRecordUpdates(
          record,
          {
            ...updates,
            family: nextFamily,
          },
        );
      }),
    );
  };

  const addRecord = (
    initial?: Partial<
      Pick<
        WritingCreditRecordDraft,
        "name" | "role" | "sortName" | "family"
      >
    >,
  ) => {
    if (records.length >= 500) {
      return;
    }

    const role = initial?.role ?? "written by";
    const family =
      initial?.family ??
      writingCreditFamilyForRole(role);

    onChange([
      ...records,
      {
        key: [
          "new-writing",
          document.scope,
          Date.now(),
          records.length,
        ].join("-"),
        family,
        sourceFamily: null,
        sourceIndex: null,
        name: initial?.name ?? "",
        role,
        sortName: resolveCreditSortName(
          initial?.name ?? "",
          initial?.sortName ?? "",
        ),
      },
    ]);
  };

  const removeRecord = (recordIndex: number) => {
    const record = records[recordIndex];

    if (!record) {
      return;
    }

    const hasContent = [
      record.name,
      record.role,
      record.sortName,
    ].some((value) => value.trim().length > 0);

    if (
      hasContent &&
      !window.confirm(
        `Remove songwriting credit ${
          record.name.trim() || recordIndex + 1
        } and the paired role?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter((_, index) => index !== recordIndex),
    );
  };

  const overrideReleaseFamily = (
    family: WritingCreditFamily,
  ) => {
    const familyDefaults = releaseDefaultRecords.filter(
      (record) => record.family === family,
    );

    onChange([
      ...records.filter((record) => record.family !== family),
      ...familyDefaults.map((record, index) => ({
        ...record,
        key: [
          "track-writing-override",
          family,
          Date.now(),
          index,
        ].join("-"),
        sourceFamily: null,
        sourceIndex: null,
      })),
    ]);
  };

  const restoreReleaseFamily = (
    family: WritingCreditFamily,
  ) => {
    const matchingCount = records.filter(
      (record) => record.family === family,
    ).length;

    if (
      matchingCount > 0 &&
      !window.confirm(
        `Remove ${matchingCount} track-level ${
          matchingCount === 1 ? "credit" : "credits"
        } in this writing category and use the release defaults?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter((record) => record.family !== family),
    );
  };

  const groupedLocalRecords =
    groupPersonRoleDisplayRecords(
      sortWritingCreditDisplayRecords(
        records.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
          family: record.family,
        })),
      ),
    );
  const groupedInheritedRecords =
    groupPersonRoleDisplayRecords(
      sortWritingCreditDisplayRecords(
        inheritedRecords.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
          family: record.family,
        })),
      ),
    );
  const readOnlyGroupedRecords = [
    ...groupedLocalRecords.map((record, sourceIndex) => ({
      record,
      inherited: false,
      sourceIndex,
    })),
    ...groupedInheritedRecords.map((record, sourceIndex) => ({
      record,
      inherited: true,
      sourceIndex:
        groupedLocalRecords.length + sourceIndex,
    })),
  ].sort((left, right) => {
    const priorityDifference =
      getWritingCreditDisplayPriority(
        left.record.roles[0] ?? "",
      ) -
      getWritingCreditDisplayPriority(
        right.record.roles[0] ?? "",
      );

    return priorityDifference !== 0
      ? priorityDifference
      : left.sourceIndex - right.sourceIndex;
  });
  const showSortNames = editMode
    ? records.length > 0
    : [
        ...groupedLocalRecords,
        ...groupedInheritedRecords,
      ].some((record) => record.sortNames.length > 0);
  const incompleteCount = records.filter(
    (record) =>
      !record.name.trim() || !record.role.trim(),
  ).length;
  const releaseFamilies = new Set(
    releaseDefaultRecords.map((record) => record.family),
  );

  return (
    <div className="performer-record-editor writing-credit-record-editor">
      <div className="performer-record-toolbar">
        <div>
          <div className="credit-pair-help-heading">
            <strong>
              {isReleaseCreditEditor
                ? "Release songwriting role and name"
                : "Songwriting role and name"}
            </strong>
            <MetadataFieldPairControls
              title={
                isReleaseCreditEditor
                  ? "Release songwriting role and name"
                  : "Songwriting role and name"
              }
              description={
                isReleaseCreditEditor
                  ? "Set release-wide writing defaults. Tracks inherit each songwriter, composer, and lyricist category until that category is overridden locally."
                  : "Credit combined authorship as Written by or Songwriter. Use Composer or Music by for music-only authorship, and Lyricist, Lyrics by, or Words by for text-only authorship."
              }
              nameField={nameField}
              namePath={`${basePath}.songwriters[].name`}
              roleField={roleField}
              rolePath={`${basePath}.songwriters[].role`}
              nameGuidance="Enter the credited writer's display name exactly as supplied by the official credits."
              roleGuidance="Use Written by when the source does not distinguish music from words. Use Composer and Lyricist when those responsibilities are known separately."
              nameExample="Nathan Brenton"
              roleExample="written by"
              commonRoleValues={Array.from(
                writingCreditRoleOptions,
              )}
              fieldOrder="role-name"
            />
          </div>
          <p>
            {isReleaseCreditEditor
              ? "Tracks inherit release writing credits by category and may override only the categories that differ."
              : "Songwriter, composer, and lyricist credits identify authorship of the musical work rather than recording or publishing ownership."}
          </p>
        </div>

        {editMode && (
          <button
            type="button"
            className="performer-add-button"
            disabled={records.length >= 500}
            onClick={() => addRecord()}
          >
            <span aria-hidden="true">+</span>
            <span>Add writing credit</span>
          </button>
        )}
      </div>

      {editMode ? (
        <>
          {incompleteCount > 0 && (
            <p className="performer-validation-note">
              Complete the name and role for every writing credit before saving.
            </p>
          )}

          {records.length === 0 ? (
            <div className="performer-empty-state">
              <p>No local songwriting credits have been added.</p>
              <button
                type="button"
                onClick={() => addRecord()}
              >
                Add first writing credit
              </button>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings">
                <div><strong>Writing role</strong></div>
                <div><strong>Name</strong></div>
                <div><strong>Actions</strong></div>
              </div>
              <div className="performer-record-list">
                {records.map((record, recordIndex) => {
                  const canRestoreRelease =
                    !isReleaseCreditEditor &&
                    releaseFamilies.has(record.family);

                  return (
                    <div
                      key={record.key}
                      className={[
                        "performer-record-row",
                        !record.name.trim() || !record.role.trim()
                          ? "is-incomplete"
                          : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <label>
                        <span className="sr-only">
                          Writing credit {recordIndex + 1} role
                        </span>
                        <SelectOrCustomMetadataInput
                          value={record.role}
                          options={Array.from(
                            writingCreditRoleOptions,
                          )}
                          selectLabel={`Select writing credit ${recordIndex + 1} role`}
                          customPlaceholder="Custom writing role"
                          ariaInvalid={!record.role.trim()}
                          onChange={(nextRole) =>
                            updateRecord(recordIndex, {
                              role: nextRole,
                            })
                          }
                        />
                      </label>

                      <label>
                        <span className="sr-only">
                          Writing credit {recordIndex + 1} name
                        </span>
                        <input
                          type="text"
                          value={record.name}
                          aria-invalid={!record.name.trim()}
                          placeholder="Credited writer"
                          onChange={(event) =>
                            updateRecord(recordIndex, {
                              name: event.target.value,
                            })
                          }
                        />
                      </label>

                      <div className="technical-credit-record-actions">
                        {canRestoreRelease && (
                          <button
                            type="button"
                            className="technical-credit-use-release-button"
                            title="Remove this track category and restore the release writing credits"
                            onClick={() =>
                              restoreReleaseFamily(record.family)
                            }
                          >
                            Use release credit
                          </button>
                        )}
                        <button
                          type="button"
                          className="performer-remove-button"
                          tabIndex={-1}
                          aria-label={`Remove writing credit ${recordIndex + 1}`}
                          title="Remove credited writer and role"
                          onClick={() => removeRecord(recordIndex)}
                        >
                          <span aria-hidden="true">−</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!isReleaseCreditEditor &&
            inheritedRecords.length > 0 && (
              <section className="inherited-technical-credit-list">
                <header>
                  <div>
                    <strong>Inherited release defaults</strong>
                    <p>
                      Override only the songwriting categories that differ on this track.
                    </p>
                  </div>
                </header>

                {sortWritingCreditDisplayRecords(
                  inheritedRecords,
                ).map((record) => (
                  <div
                    key={record.key}
                    className="inherited-technical-credit-row"
                  >
                    <span>{record.role}</span>
                    <span>{record.name}</span>
                    <button
                      type="button"
                      title="Copy every release credit in this writing category into a track-level override"
                      onClick={() =>
                        overrideReleaseFamily(record.family)
                      }
                    >
                      Override category
                    </button>
                  </div>
                ))}
              </section>
            )}
        </>
      ) : (
        <>
          {readOnlyGroupedRecords.length === 0 ? (
            <div className="performer-empty-state">
              <p>No songwriting or composition credits have been added.</p>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings is-read-only">
                <div><strong>Writing role</strong></div>
                <div><strong>Name</strong></div>
              </div>
              <div className="performer-record-list">
                {readOnlyGroupedRecords.map(
                  ({ record, inherited }) => (
                    <div
                      key={`${inherited ? "inherited" : "local"}:${record.key}`}
                      className="performer-record-row is-read-only is-grouped-display"
                    >
                      <span>
                        {record.roles.length > 0
                          ? record.roles.join(", ")
                          : "(role not entered)"}
                      </span>
                      <span>
                        {record.name || "(name not entered)"}
                        {inherited && (
                          <small className="metadata-provenance-note metadata-inherited-note technical-credit-inherited-note">
                            Inherited from release
                          </small>
                        )}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </>
      )}

      {showSortNames &&
        (records.length > 0 || inheritedRecords.length > 0) && (
        <details
          className="metadata-related-tags performer-related-tags"
          open={relatedOpen}
          onToggle={onRelatedToggle}
        >
          <summary>
            <span
              className="metadata-section-triangle"
              aria-hidden="true"
            />
            <span>Related tags</span>
          </summary>

          <div className="performer-sort-name-list">
            <header>
              <strong>Writer sort names</strong>
              <MetadataFieldControls
                field={sortNameField}
                path={`${basePath}.songwriters[].sort_name`}
                valueType="string"
              />
            </header>

            {editMode
              ? records.map((record, recordIndex) => (
                  <label key={record.key}>
                    <span>
                      {record.name ||
                        `Writing credit ${recordIndex + 1}`}
                    </span>
                    <input
                      type="text"
                      value={record.sortName}
                      placeholder="Last, First"
                      onChange={(event) =>
                        updateRecord(recordIndex, {
                          sortName: event.target.value,
                        })
                      }
                    />
                  </label>
                ))
              : [
                  ...groupedLocalRecords.map((record) => ({
                    record,
                    inherited: false,
                  })),
                  ...groupedInheritedRecords.map((record) => ({
                    record,
                    inherited: true,
                  })),
                ]
                  .filter(
                    ({ record }) => record.sortNames.length > 0,
                  )
                  .map(({ record, inherited }) => (
                    <label key={`${inherited ? "inherited" : "local"}:${record.key}`}>
                      <span>
                        {record.name || "(name not entered)"}
                        {inherited ? " · inherited" : ""}
                      </span>
                      <span>{record.sortNames.join(", ")}</span>
                    </label>
                  ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ArrangementCreditRecordEditor({
  document,
  records,
  inheritedRecords = [],
  releaseDefaultRecords = [],
  editMode,
  metadataRegistry,
  relatedOpen,
  onRelatedToggle,
  onChange,
}: {
  document: ParsedMetadataDocument;
  records: PerformerRecordDraft[];
  inheritedRecords?: PerformerRecordDraft[];
  releaseDefaultRecords?: PerformerRecordDraft[];
  editMode: boolean;
  metadataRegistry: MetadataFieldDefinition[];
  relatedOpen: boolean;
  onRelatedToggle: (
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => void;
  onChange: (
    records: PerformerRecordDraft[],
  ) => void;
}) {
  const contributorPath =
    getArrangementContributorPath(
      document,
    );
  const indexedContributorPath =
    contributorPath.replace(
      ".contributors",
      ".contributors[0]",
    );
  const genericContributorPath =
    contributorPath.replace(
      ".contributors",
      ".contributors[]",
    );
  const nameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.name`,
    );
  const roleField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.role`,
    );
  const sortNameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.sort_name`,
    );
  const contributorRoleOptions =
    roleField?.editor?.options ??
    roleField?.presentation?.commonValues ??
    [];
  const arrangementRoleOptions =
    contributorRoleOptions.filter(
      isArrangementContributorRoleValue,
    );
  const isReleaseCreditEditor =
    document.scope === "release";

  const updateRecord = (
    recordIndex: number,
    updates: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    onChange(
      records.map((record, index) =>
        index === recordIndex
          ? applyCreditRecordUpdates<
              PerformerRecordDraft
            >(
              record,
              updates,
            )
          : record,
      ),
    );
  };

  const addRecord = (
    initial?: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    if (records.length >= 500) {
      return;
    }

    onChange([
      ...records,
      {
        key: [
          "new-arrangement",
          document.scope,
          Date.now(),
          records.length,
        ].join("-"),
        sourceIndex: null,
        name: initial?.name ?? "",
        role: initial?.role ?? "",
        sortName: resolveCreditSortName(
          initial?.name ?? "",
          initial?.sortName ?? "",
        ),
      },
    ]);
  };

  const removeRecord = (
    recordIndex: number,
  ) => {
    const record = records[recordIndex];

    if (!record) {
      return;
    }

    const hasContent = [
      record.name,
      record.role,
      record.sortName,
    ].some(
      (value) =>
        value.trim().length > 0,
    );

    if (
      hasContent &&
      !window.confirm(
        `Remove arrangement credit ${
          record.name.trim() ||
          recordIndex + 1
        } and the paired role?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (_, index) =>
          index !== recordIndex,
      ),
    );
  };

  const restoreReleaseRole = (
    role: string,
  ) => {
    const overrideKey =
      arrangementCreditOverrideKey(role);
    const matchingCount = records.filter(
      (record) =>
        arrangementCreditOverrideKey(
          record.role,
        ) === overrideKey,
    ).length;

    if (
      matchingCount > 0 &&
      !window.confirm(
        `Remove ${matchingCount} track-level ${
          matchingCount === 1
            ? "credit"
            : "credits"
        } for “${role}” and use the release default?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (record) =>
          arrangementCreditOverrideKey(
            record.role,
          ) !== overrideKey,
      ),
    );
  };

  const groupedLocalRecords =
    groupPersonRoleDisplayRecords(
      sortArrangementCreditDisplayRecords(
        records.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        })),
      ),
    );
  const groupedInheritedRecords =
    groupPersonRoleDisplayRecords(
      sortArrangementCreditDisplayRecords(
        inheritedRecords.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        })),
      ),
    );
  const readOnlyGroupedRecords = [
    ...groupedLocalRecords.map(
      (record, sourceIndex) => ({
        record,
        inherited: false,
        sourceIndex,
      }),
    ),
    ...groupedInheritedRecords.map(
      (record, sourceIndex) => ({
        record,
        inherited: true,
        sourceIndex:
          groupedLocalRecords.length +
          sourceIndex,
      }),
    ),
  ].sort((left, right) => {
    const priorityDifference =
      getArrangementCreditDisplayPriority(
        left.record.roles[0] ?? "",
      ) -
      getArrangementCreditDisplayPriority(
        right.record.roles[0] ?? "",
      );

    return priorityDifference !== 0
      ? priorityDifference
      : left.sourceIndex - right.sourceIndex;
  });
  const showSortNames = editMode
    ? records.some(
        (record) =>
          record.sortName.trim(),
      ) || records.length > 0
    : [
        ...groupedLocalRecords,
        ...groupedInheritedRecords,
      ].some(
        (record) =>
          record.sortNames.length > 0,
      );
  const incompleteCount = records.filter(
    (record) =>
      !record.name.trim() ||
      !record.role.trim(),
  ).length;
  const releaseOverrideKeys = new Set(
    releaseDefaultRecords.map((record) =>
      arrangementCreditOverrideKey(
        record.role,
      ),
    ),
  );

  const renderReadOnlyRecord = (
    record: GroupedPersonRoleDisplay,
    inherited: boolean,
  ) => (
    <div
      key={`${
        inherited ? "inherited" : "local"
      }:${record.key}`}
      className="performer-record-row is-read-only is-grouped-display"
    >
      <span>
        {record.roles.length > 0
          ? record.roles.join(", ")
          : "(role not entered)"}
      </span>
      <span>
        {record.name ||
          "(name not entered)"}
        {inherited && (
          <small className="metadata-provenance-note metadata-inherited-note technical-credit-inherited-note">
            Inherited from release
          </small>
        )}
      </span>
    </div>
  );

  return (
    <div className="performer-record-editor arrangement-credit-record-editor">
      <div className="performer-record-toolbar">
        <div>
          <div className="credit-pair-help-heading">
            <strong>
              {isReleaseCreditEditor
                ? "Release arrangement & orchestration role and name"
                : "Arrangement & orchestration role and name"}
            </strong>
            <MetadataFieldPairControls
              title={
                isReleaseCreditEditor
                  ? "Release arrangement & orchestration role and name"
                  : "Arrangement & orchestration role and name"
              }
              description={
                isReleaseCreditEditor
                  ? "Release arrangement and orchestration credits become defaults for every track. Add one record per credited person and role."
                  : "Track-level arrangement credits override matching release defaults by role. Unrelated release arrangement roles continue to inherit."
              }
              nameField={nameField}
              namePath={`${genericContributorPath}.name`}
              roleField={roleField}
              rolePath={`${genericContributorPath}.role`}
              nameGuidance="Enter the credited person's name exactly as supplied by the contributor, liner notes, or release documentation."
              roleGuidance={
                isReleaseCreditEditor
                  ? "Use one arrangement or orchestration role per record. Tracks inherit these credits until a track supplies an override for the same role family."
                  : "Use one arrangement or orchestration role per record. A track-level role replaces the matching release default while unrelated release credits remain inherited."
              }
              nameExample="Nathan Brenton"
              roleExample="string arranger"
              commonRoleValues={
                arrangementRoleOptions
              }
              fieldOrder="role-name"
            />
          </div>
          <p>
            {isReleaseCreditEditor
              ? "Set release-wide arrangement defaults, then tailor only the tracks that differ."
              : "Track arrangement credits override matching release defaults; all other release arrangement credits remain inherited."}
          </p>

          {editMode &&
            incompleteCount > 0 && (
            <p className="performer-validation-message">
              {incompleteCount} incomplete{" "}
              {incompleteCount === 1
                ? "record needs"
                : "records need"}{" "}
              both a name and role before saving.
            </p>
          )}
        </div>

        {editMode && (
          <button
            type="button"
            className="performer-add-button"
            disabled={records.length >= 500}
            onClick={() => addRecord()}
          >
            <span aria-hidden="true">+</span>
            <span>Add arrangement credit</span>
          </button>
        )}
      </div>

      {editMode ? (
        <>
          {records.length === 0 ? (
            <div className="performer-empty-state">
              <p>
                {isReleaseCreditEditor
                  ? "No release-level arrangement or orchestration credits have been added."
                  : inheritedRecords.length > 0
                    ? "This track currently uses all release-level arrangement defaults."
                    : "No arrangement or orchestration credits have been added."}
              </p>

              <button
                type="button"
                className="performer-add-button"
                onClick={() => addRecord()}
              >
                <span aria-hidden="true">+</span>
                <span>
                  {isReleaseCreditEditor
                    ? "Add first release credit"
                    : "Add track override"}
                </span>
              </button>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings">
                <div>
                  <strong>
                    Arrangement or orchestration role
                  </strong>
                </div>
                <div><strong>Name</strong></div>
                <span className="sr-only">
                  Record actions
                </span>
              </div>

              <div className="performer-record-list">
                {records.map(
                  (record, recordIndex) => {
                    const canRestoreRelease =
                      !isReleaseCreditEditor &&
                      releaseOverrideKeys.has(
                        arrangementCreditOverrideKey(
                          record.role,
                        ),
                      );

                    return (
                      <div
                        key={record.key}
                        className={[
                          "performer-record-row",
                          !record.name.trim() ||
                          !record.role.trim()
                            ? "is-incomplete"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <label>
                          <span className="sr-only">
                            Arrangement credit {recordIndex + 1} role
                          </span>
                          <SelectOrCustomMetadataInput
                            value={record.role}
                            options={
                              arrangementRoleOptions
                            }
                            selectLabel={`Select arrangement credit ${recordIndex + 1} role`}
                            customPlaceholder="Custom arrangement or orchestration role"
                            ariaInvalid={!record.role.trim()}
                            onChange={(nextRole) =>
                              updateRecord(
                                recordIndex,
                                { role: nextRole },
                              )
                            }
                          />
                        </label>

                        <label>
                          <span className="sr-only">
                            Arrangement credit {recordIndex + 1} name
                          </span>
                          <input
                            type="text"
                            value={record.name}
                            aria-invalid={!record.name.trim()}
                            placeholder="Credited person"
                            onChange={(event) =>
                              updateRecord(
                                recordIndex,
                                {
                                  name: event.target.value,
                                },
                              )
                            }
                          />
                        </label>

                        <div className="technical-credit-record-actions">
                          {canRestoreRelease && (
                            <button
                              type="button"
                              className="technical-credit-use-release-button"
                              title="Remove track override and restore the release arrangement credit"
                              onClick={() =>
                                restoreReleaseRole(
                                  record.role,
                                )
                              }
                            >
                              Use release credit
                            </button>
                          )}

                          <button
                            type="button"
                            className="performer-remove-button"
                            tabIndex={-1}
                            aria-label={`Remove arrangement credit ${recordIndex + 1}`}
                            title="Remove credited person and role"
                            onClick={() =>
                              removeRecord(recordIndex)
                            }
                          >
                            <span aria-hidden="true">−</span>
                          </button>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </>
          )}

          {!isReleaseCreditEditor &&
            inheritedRecords.length > 0 && (
            <section className="inherited-technical-credit-list">
              <header>
                <div>
                  <strong>Inherited release defaults</strong>
                  <p>
                    Override only the arrangement roles that differ on this track.
                  </p>
                </div>
              </header>

              {sortArrangementCreditDisplayRecords(
                inheritedRecords,
              ).map((record) => (
                <div
                  key={record.key}
                  className="inherited-technical-credit-row"
                >
                  <span>{record.role}</span>
                  <span>{record.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      addRecord({
                        name: record.name,
                        role: record.role,
                        sortName: record.sortName,
                      })
                    }
                  >
                    Override
                  </button>
                </div>
              ))}
            </section>
          )}
        </>
      ) : (
        <>
          {readOnlyGroupedRecords.length === 0 ? (
            <div className="performer-empty-state">
              <p>
                No arrangement or orchestration credits have been added.
              </p>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings is-read-only">
                <div>
                  <strong>
                    Arrangement or orchestration role
                  </strong>
                </div>
                <div><strong>Name</strong></div>
              </div>
              <div className="performer-record-list">
                {readOnlyGroupedRecords.map(
                  ({ record, inherited }) =>
                    renderReadOnlyRecord(
                      record,
                      inherited,
                    ),
                )}
              </div>
            </>
          )}
        </>
      )}

      {showSortNames &&
        records.length > 0 && (
        <details
          className="metadata-related-tags performer-related-tags"
          open={relatedOpen}
          onToggle={onRelatedToggle}
        >
          <summary>
            <span
              className="metadata-section-triangle"
              aria-hidden="true"
            />
            <span>Related tags</span>
          </summary>

          <div className="performer-sort-name-list">
            <header>
              <strong>
                Contributor sort names
              </strong>
              <MetadataFieldControls
                field={sortNameField}
                path={`${genericContributorPath}.sort_name`}
                valueType="string"
              />
            </header>

            {editMode
              ? records.map(
                  (record, recordIndex) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          `Arrangement credit ${recordIndex + 1}`}
                      </span>

                      <input
                        type="text"
                        value={record.sortName}
                        placeholder="Last, First"
                        onChange={(event) =>
                          updateRecord(
                            recordIndex,
                            {
                              sortName:
                                event.target.value,
                            },
                          )
                        }
                      />
                    </label>
                  ),
                )
              : groupedLocalRecords
                  .filter(
                    (record) =>
                      record.sortNames.length > 0,
                  )
                  .map((record) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          "(name not entered)"}
                      </span>
                      <span>
                        {record.sortNames.join(", ")}
                      </span>
                    </label>
                  ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TechnicalCreditRecordEditor({
  document,
  records,
  inheritedRecords = [],
  releaseDefaultRecords = [],
  editMode,
  metadataRegistry,
  relatedOpen,
  onRelatedToggle,
  onChange,
}: {
  document: ParsedMetadataDocument;
  records: PerformerRecordDraft[];
  inheritedRecords?: PerformerRecordDraft[];
  releaseDefaultRecords?: PerformerRecordDraft[];
  editMode: boolean;
  metadataRegistry: MetadataFieldDefinition[];
  relatedOpen: boolean;
  onRelatedToggle: (
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => void;
  onChange: (
    records: PerformerRecordDraft[],
  ) => void;
}) {
  const contributorPath =
    getTechnicalContributorPath(
      document,
    );
  const indexedContributorPath =
    contributorPath.replace(
      ".contributors",
      ".contributors[0]",
    );
  const genericContributorPath =
    contributorPath.replace(
      ".contributors",
      ".contributors[]",
    );
  const nameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.name`,
    );
  const roleField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.role`,
    );
  const sortNameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.sort_name`,
    );
  const contributorRoleOptions =
    roleField?.editor?.options ??
    roleField?.presentation?.commonValues ??
    [];
  const technicalRoleOptions =
    contributorRoleOptions.filter(
      isTechnicalContributorRoleValue,
    );
  const isReleaseCreditEditor =
    document.scope === "release";

  const updateRecord = (
    recordIndex: number,
    updates: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    onChange(
      records.map(
        (record, index) =>
          index === recordIndex
            ? applyCreditRecordUpdates<
                PerformerRecordDraft
              >(
                record,
                updates,
              )
            : record,
      ),
    );
  };

  const addRecord = (
    initial?: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    if (records.length >= 500) {
      return;
    }

    onChange([
      ...records,
      {
        key: [
          "new-technical",
          document.scope,
          Date.now(),
          records.length,
        ].join("-"),
        sourceIndex: null,
        name: initial?.name ?? "",
        role: initial?.role ?? "",
        sortName: resolveCreditSortName(
          initial?.name ?? "",
          initial?.sortName ?? "",
        ),
      },
    ]);
  };

  const removeRecord = (
    recordIndex: number,
  ) => {
    const record =
      records[recordIndex];

    if (!record) {
      return;
    }

    const hasContent = [
      record.name,
      record.role,
      record.sortName,
    ].some(
      (value) =>
        value.trim().length > 0,
    );

    if (
      hasContent &&
      !window.confirm(
        `Remove technical credit ${
          record.name.trim() ||
          recordIndex + 1
        } and the paired role?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (_, index) =>
          index !== recordIndex,
      ),
    );
  };

  const restoreReleaseRole = (
    role: string,
  ) => {
    const overrideKey =
      technicalCreditOverrideKey(role);
    const matchingCount =
      records.filter(
        (record) =>
          technicalCreditOverrideKey(
            record.role,
          ) === overrideKey,
      ).length;

    if (
      matchingCount > 0 &&
      !window.confirm(
        `Remove ${matchingCount} track-level ${
          matchingCount === 1
            ? "credit"
            : "credits"
        } for “${role}” and use the release default?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (record) =>
          technicalCreditOverrideKey(
            record.role,
          ) !== overrideKey,
      ),
    );
  };

  const groupedLocalRecords =
    groupPersonRoleDisplayRecords(
      sortTechnicalCreditDisplayRecords(
        records.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        })),
      ),
    );
  const groupedInheritedRecords =
    groupPersonRoleDisplayRecords(
      sortTechnicalCreditDisplayRecords(
        inheritedRecords.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        })),
      ),
    );
  const readOnlyGroupedRecords = [
    ...groupedLocalRecords.map(
      (record, sourceIndex) => ({
        record,
        inherited: false,
        sourceIndex,
      }),
    ),
    ...groupedInheritedRecords.map(
      (record, sourceIndex) => ({
        record,
        inherited: true,
        sourceIndex:
          groupedLocalRecords.length +
          sourceIndex,
      }),
    ),
  ].sort((left, right) => {
    const priorityDifference =
      getTechnicalCreditDisplayPriority(
        left.record.roles[0] ?? "",
      ) -
      getTechnicalCreditDisplayPriority(
        right.record.roles[0] ?? "",
      );

    return priorityDifference !== 0
      ? priorityDifference
      : left.sourceIndex - right.sourceIndex;
  });
  const showSortNames =
    editMode
      ? records.some(
          (record) =>
            record.sortName.trim(),
        ) || records.length > 0
      : [
          ...groupedLocalRecords,
          ...groupedInheritedRecords,
        ].some(
          (record) =>
            record.sortNames.length > 0,
        );
  const incompleteCount =
    records.filter(
      (record) =>
        !record.name.trim() ||
        !record.role.trim(),
    ).length;
  const releaseOverrideKeys =
    new Set(
      releaseDefaultRecords.map((record) =>
        technicalCreditOverrideKey(
          record.role,
        ),
      ),
    );

  const renderReadOnlyRecord = (
    record: GroupedPersonRoleDisplay,
    inherited: boolean,
  ) => (
    <div
      key={`${inherited ? "inherited" : "local"}:${record.key}`}
      className="performer-record-row is-read-only is-grouped-display"
    >
      <span>
        {record.roles.length > 0
          ? record.roles.join(", ")
          : "(role not entered)"}
      </span>
      <span>
        {record.name ||
          "(name not entered)"}
        {inherited && (
          <small className="metadata-provenance-note metadata-inherited-note technical-credit-inherited-note">
            Inherited from release
          </small>
        )}
      </span>
    </div>
  );

  return (
    <div className="performer-record-editor technical-credit-record-editor">
      <div className="performer-record-toolbar">
        <div>
          <div className="credit-pair-help-heading">
            <strong>
              {isReleaseCreditEditor
                ? "Release technical credit role and name"
                : "Technical credit role and name"}
            </strong>
            <MetadataFieldPairControls
              title={
                isReleaseCreditEditor
                  ? "Release technical credit role and name"
                  : "Technical credit role and name"
              }
              description={
                isReleaseCreditEditor
                  ? "Release-level recording, mixing, and mastering credits become defaults for every track. Add one record per credited person and role."
                  : "Track-level technical credits override matching release defaults by role. Unrelated release roles continue to inherit."
              }
              nameField={nameField}
              namePath={`${genericContributorPath}.name`}
              roleField={roleField}
              rolePath={`${genericContributorPath}.role`}
              nameGuidance="Enter the credited person's name exactly as supplied by the contributor, liner notes, or release documentation."
              roleGuidance={
                isReleaseCreditEditor
                  ? "Use one recording, mixing, or mastering role per record. These credits are inherited by tracks until a track supplies an override for the same role."
                  : "Use one recording, mixing, or mastering role per record. A track-level role replaces the matching release default while other release credits remain inherited."
              }
              nameExample="Nathan Brenton"
              roleExample="recorded by"
              commonRoleValues={technicalRoleOptions}
              fieldOrder="role-name"
            />
          </div>
          <p>
            {isReleaseCreditEditor
              ? "Set release-wide defaults, then tailor only the tracks that differ."
              : "Track credits override matching release defaults; all other release credits remain inherited."}
          </p>

          {editMode &&
            incompleteCount > 0 && (
            <p className="performer-validation-message">
              {incompleteCount} incomplete{" "}
              {incompleteCount === 1
                ? "record needs"
                : "records need"}{" "}
              both a name and role before saving.
            </p>
          )}
        </div>

        {editMode && (
          <button
            type="button"
            className="performer-add-button"
            disabled={records.length >= 500}
            onClick={() => addRecord()}
          >
            <span aria-hidden="true">+</span>
            <span>Add technical credit</span>
          </button>
        )}
      </div>

      {editMode ? (
        <>
          {records.length === 0 ? (
            <div className="performer-empty-state">
              <p>
                {isReleaseCreditEditor
                  ? "No release-level recording, mixing, or mastering credits have been added."
                  : inheritedRecords.length > 0
                    ? "This track currently uses all release-level technical-credit defaults."
                    : "No recording, mixing, or mastering credits have been added."}
              </p>

              <button
                type="button"
                className="performer-add-button"
                onClick={() => addRecord()}
              >
                <span aria-hidden="true">+</span>
                <span>
                  {isReleaseCreditEditor
                    ? "Add first release credit"
                    : "Add track override"}
                </span>
              </button>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings">
                <div>
                  <strong>
                    Recording, mixing or mastering role
                  </strong>
                </div>
                <div><strong>Name</strong></div>
                <span className="sr-only">
                  Record actions
                </span>
              </div>

              <div className="performer-record-list">
                {records.map(
                  (record, recordIndex) => {
                    const canRestoreRelease =
                      !isReleaseCreditEditor &&
                      releaseOverrideKeys.has(
                        technicalCreditOverrideKey(
                          record.role,
                        ),
                      );

                    return (
                      <div
                        key={record.key}
                        className={[
                          "performer-record-row",
                          !record.name.trim() ||
                          !record.role.trim()
                            ? "is-incomplete"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <label>
                          <span className="sr-only">
                            Technical credit {recordIndex + 1} role
                          </span>
                          <SelectOrCustomMetadataInput
                            value={record.role}
                            options={technicalRoleOptions}
                            selectLabel={`Select technical credit ${recordIndex + 1} role`}
                            customPlaceholder="Custom recording, mixing, or mastering role"
                            ariaInvalid={!record.role.trim()}
                            onChange={(nextRole) =>
                              updateRecord(
                                recordIndex,
                                { role: nextRole },
                              )
                            }
                          />
                        </label>

                        <label>
                          <span className="sr-only">
                            Technical credit {recordIndex + 1} name
                          </span>
                          <input
                            type="text"
                            value={record.name}
                            aria-invalid={!record.name.trim()}
                            placeholder="Credited person"
                            onChange={(event) =>
                              updateRecord(
                                recordIndex,
                                { name: event.target.value },
                              )
                            }
                          />
                        </label>

                        <div className="technical-credit-record-actions">
                          {canRestoreRelease && (
                            <button
                              type="button"
                              className="technical-credit-use-release-button"
                              title="Remove track override and restore the release credit"
                              onClick={() =>
                                restoreReleaseRole(
                                  record.role,
                                )
                              }
                            >
                              Use release credit
                            </button>
                          )}

                          <button
                            type="button"
                            className="performer-remove-button"
                            tabIndex={-1}
                            aria-label={`Remove technical credit ${recordIndex + 1}`}
                            title="Remove credited person and role"
                            onClick={() =>
                              removeRecord(recordIndex)
                            }
                          >
                            <span aria-hidden="true">−</span>
                          </button>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </>
          )}

          {!isReleaseCreditEditor &&
            inheritedRecords.length > 0 && (
            <section className="inherited-technical-credit-list">
              <header>
                <div>
                  <strong>Inherited release defaults</strong>
                  <p>
                    Override only the roles that differ on this track.
                  </p>
                </div>
              </header>

              {sortTechnicalCreditDisplayRecords(
                inheritedRecords,
              ).map((record, index) => (
                  <div
                    key={record.key}
                    className="inherited-technical-credit-row"
                  >
                    <span>{record.role}</span>
                    <span>{record.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        addRecord({
                          name: record.name,
                          role: record.role,
                          sortName: record.sortName,
                        })
                      }
                    >
                      Override
                    </button>
                  </div>
                ),
              )}
            </section>
          )}
        </>
      ) : (
        <>
          {readOnlyGroupedRecords.length === 0 ? (
            <div className="performer-empty-state">
              <p>
                No recording, mixing, or mastering credits have been added.
              </p>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings is-read-only">
                <div>
                  <strong>
                    Recording, mixing or mastering role
                  </strong>
                </div>
                <div><strong>Name</strong></div>
              </div>
              <div className="performer-record-list">
                {readOnlyGroupedRecords.map(
                  ({ record, inherited }) =>
                    renderReadOnlyRecord(
                      record,
                      inherited,
                    ),
                )}
              </div>
            </>
          )}
        </>
      )}

      {showSortNames &&
        records.length > 0 && (
        <details
          className="metadata-related-tags performer-related-tags"
          open={relatedOpen}
          onToggle={onRelatedToggle}
        >
          <summary>
            <span
              className="metadata-section-triangle"
              aria-hidden="true"
            />
            <span>Related tags</span>
          </summary>

          <div className="performer-sort-name-list">
            <header>
              <strong>
                Contributor sort names
              </strong>
              <MetadataFieldControls
                field={sortNameField}
                path={`${genericContributorPath}.sort_name`}
                valueType="string"
              />
            </header>

            {editMode
              ? records.map(
                  (record, recordIndex) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          `Technical credit ${recordIndex + 1}`}
                      </span>

                      <input
                        type="text"
                        value={record.sortName}
                        placeholder="Last, First"
                        onChange={(event) =>
                          updateRecord(
                            recordIndex,
                            {
                              sortName:
                                event.target.value,
                            },
                          )
                        }
                      />
                    </label>
                  ),
                )
              : groupedLocalRecords
                  .filter(
                    (record) =>
                      record.sortNames.length > 0,
                  )
                  .map((record) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          "(name not entered)"}
                      </span>
                      <span>
                        {record.sortNames.join(", ")}
                      </span>
                    </label>
                  ))}
          </div>
        </details>
      )}
    </div>
  );
}

export {
  PerformerRecordEditor,
  WritingCreditRecordEditor,
  ArrangementCreditRecordEditor,
  TechnicalCreditRecordEditor,
};
