import {
  commaSeparatedValues,
  sampleClearanceStatusOptions,
  sampleRelationshipTypeOptions,
  suggestSampleCreditText,
  type SampleClearanceRecordDraft,
  type SampleRelationshipRecordDraft,
} from "./sample-relationship.js";

// These editors are loaded only when their metadata sections are rendered.
// Keeping the form-heavy sample workflow out of the initial application chunk
// reduces startup parsing while preserving the same controlled draft callbacks.
export function SampleRelationshipRecordEditor({
  records,
  editMode,
  onChange,
}: {
  records: SampleRelationshipRecordDraft[];
  editMode: boolean;
  onChange: (records: SampleRelationshipRecordDraft[]) => void;
}) {
  const updateRecord = (
    index: number,
    changes: Partial<SampleRelationshipRecordDraft>,
  ) => {
    onChange(
      records.map((record, recordIndex) =>
        recordIndex === index
          ? { ...record, ...changes }
          : record,
      ),
    );
  };

  if (!editMode) {
    return records.length > 0 ? (
      <div className="sample-record-readonly-list">
        {records.map((record, index) => (
          <article key={record.key} className="sample-record-readonly-row">
            <span className="sample-record-index">{index + 1}</span>
            <div>
              <strong>{record.sourceTitle || "(source title not entered)"}</strong>
              <small>
                {record.relationshipType}
                {record.sourceArtist ? ` · ${record.sourceArtist}` : ""}
              </small>
              {record.usageDescription && <p>{record.usageDescription}</p>}
              {record.creditText && (
                <p className="sample-credit-text">{record.creditText}</p>
              )}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <p className="metadata-record-empty-state">
        No samples, interpolations, or quotations have been credited for this track.
      </p>
    );
  }

  return (
    <div className="sample-record-editor">
      <p className="sample-record-guidance">
        Record the source relationship here. Source artists are not automatically
        added as performers, and source writers are not automatically added to the
        current track&apos;s songwriting credits.
      </p>

      {records.map((record, index) => (
        <fieldset key={record.key} className="sample-record-form">
          <legend>Source {index + 1}</legend>

          <div className="sample-record-form-grid">
            <label>
              <span>Relationship</span>
              <select
                value={record.relationshipType}
                onChange={(event) =>
                  updateRecord(index, {
                    relationshipType: event.target.value as SampleRelationshipRecordDraft["relationshipType"],
                  })
                }
              >
                {sampleRelationshipTypeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="sample-record-wide">
              <span>Source title</span>
              <input
                type="text"
                value={record.sourceTitle}
                placeholder="Official recording or work title"
                onChange={(event) => updateRecord(index, { sourceTitle: event.target.value })}
              />
            </label>

            <label>
              <span>Source artist</span>
              <input
                type="text"
                value={record.sourceArtist}
                placeholder="Artist on the source recording"
                onChange={(event) => updateRecord(index, { sourceArtist: event.target.value })}
              />
            </label>

            <label className="sample-record-wide">
              <span>Source writers</span>
              <input
                type="text"
                value={record.sourceWriters.join(", ")}
                placeholder="Writer One, Writer Two"
                onChange={(event) =>
                  updateRecord(index, {
                    sourceWriters: commaSeparatedValues(event.target.value),
                  })
                }
              />
            </label>

            <label>
              <span>Source release</span>
              <input
                type="text"
                value={record.sourceRelease}
                onChange={(event) => updateRecord(index, { sourceRelease: event.target.value })}
              />
            </label>

            <label>
              <span>Source year</span>
              <input
                type="number"
                min="1000"
                max="9999"
                value={record.sourceYear ?? ""}
                placeholder="1971"
                onChange={(event) =>
                  updateRecord(index, {
                    sourceYear: event.target.value
                      ? Number.parseInt(event.target.value, 10)
                      : null,
                  })
                }
              />
            </label>

            <label>
              <span>Source ISRC</span>
              <input
                type="text"
                value={record.sourceIsrc}
                onChange={(event) => updateRecord(index, { sourceIsrc: event.target.value })}
              />
            </label>

            <label>
              <span>Source ISWC</span>
              <input
                type="text"
                value={record.sourceIswc}
                onChange={(event) => updateRecord(index, { sourceIswc: event.target.value })}
              />
            </label>

            <label className="sample-record-wide">
              <span>Usage description</span>
              <input
                type="text"
                value={record.usageDescription}
                placeholder="drum break, vocal phrase, melody"
                onChange={(event) => updateRecord(index, { usageDescription: event.target.value })}
              />
            </label>

            <label className="sample-record-full">
              <span>Official credit wording</span>
              <textarea
                rows={2}
                value={record.creditText}
                placeholder="Contains samples from “Source Title” as performed by Source Artist."
                onChange={(event) => updateRecord(index, { creditText: event.target.value })}
              />
            </label>

            <div className="sample-record-credit-action sample-record-full">
              <button
                type="button"
                className="secondary-action"
                disabled={!record.sourceTitle.trim() && !record.sourceArtist.trim()}
                onClick={() =>
                  updateRecord(index, {
                    creditText: suggestSampleCreditText(record),
                  })
                }
              >
                Use suggested wording
              </button>
              <small>
                Replace the suggestion with exact licensed wording when supplied.
              </small>
            </div>

            <label className="sample-record-full">
              <span>Internal notes</span>
              <textarea
                rows={2}
                value={record.notes}
                onChange={(event) => updateRecord(index, { notes: event.target.value })}
              />
            </label>
          </div>

          <button
            type="button"
            className="performer-remove-button"
            onClick={() => onChange(records.filter((_, recordIndex) => recordIndex !== index))}
          >
            Remove source
          </button>
        </fieldset>
      ))}

      <button
        type="button"
        className="performer-add-button"
        onClick={() =>
          onChange([
            ...records,
            {
              key: `new-sample-${Date.now()}-${records.length}`,
              sourceIndex: null,
              relationshipType: "sample",
              sourceTitle: "",
              sourceArtist: "",
              sourceWriters: [],
              sourceRelease: "",
              sourceYear: null,
              sourceIsrc: "",
              sourceIswc: "",
              usageDescription: "",
              creditText: "",
              notes: "",
            },
          ])
        }
      >
        <span aria-hidden="true">+</span>
        <span>Add sample or interpolation</span>
      </button>
    </div>
  );
}

export function SampleClearanceRecordEditor({
  records,
  sampleCount,
  editMode,
  onChange,
}: {
  records: SampleClearanceRecordDraft[];
  sampleCount: number;
  editMode: boolean;
  onChange: (records: SampleClearanceRecordDraft[]) => void;
}) {
  const updateRecord = (
    index: number,
    changes: Partial<SampleClearanceRecordDraft>,
  ) => {
    onChange(records.map((record, recordIndex) =>
      recordIndex === index ? { ...record, ...changes } : record,
    ));
  };

  if (!editMode) {
    return records.length > 0 ? (
      <div className="sample-clearance-table-wrap">
        <table className="sample-clearance-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Master use</th>
              <th>Publishing</th>
              <th>Agreement</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.key}>
                <td>{record.sampleReference}</td>
                <td>{record.status}</td>
                <td>{record.masterUseCleared ? "Cleared" : "Not cleared"}</td>
                <td>{record.publishingCleared ? "Cleared" : "Not cleared"}</td>
                <td>{record.agreementReference || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sample-clearance-private-note">
          Editor-only administrative data; excluded from player-facing metadata.
        </p>
      </div>
    ) : (
      <p className="metadata-record-empty-state">
        No sample-clearance records exist for this track.
      </p>
    );
  }

  return (
    <div className="sample-record-editor">
      <p className="sample-clearance-private-note">
        Private administrative records. Reference the numbered source in Samples
        &amp; Interpolations; do not paste confidential agreement text here.
      </p>

      {records.map((record, index) => (
        <fieldset key={record.key} className="sample-record-form sample-clearance-form">
          <legend>Clearance {index + 1}</legend>
          <div className="sample-record-form-grid">
            <label>
              <span>Sample reference</span>
              <select
                value={record.sampleReference}
                onChange={(event) =>
                  updateRecord(index, {
                    sampleReference: Number.parseInt(event.target.value, 10),
                  })
                }
              >
                {Array.from({ length: Math.max(sampleCount, record.sampleReference, 1) }, (_, sourceIndex) => (
                  <option key={sourceIndex + 1} value={sourceIndex + 1}>
                    Source {sourceIndex + 1}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={record.status}
                onChange={(event) =>
                  updateRecord(index, {
                    status: event.target.value as SampleClearanceRecordDraft["status"],
                  })
                }
              >
                {sampleClearanceStatusOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="sample-clearance-checkbox">
              <input
                type="checkbox"
                checked={record.masterUseCleared}
                onChange={(event) => updateRecord(index, { masterUseCleared: event.target.checked })}
              />
              <span>Master-use rights cleared</span>
            </label>

            <label className="sample-clearance-checkbox">
              <input
                type="checkbox"
                checked={record.publishingCleared}
                onChange={(event) => updateRecord(index, { publishingCleared: event.target.checked })}
              />
              <span>Publishing rights cleared</span>
            </label>

            <label>
              <span>Agreement reference</span>
              <input
                type="text"
                value={record.agreementReference}
                placeholder="AGR-2026-014"
                onChange={(event) => updateRecord(index, { agreementReference: event.target.value })}
              />
            </label>

            <label>
              <span>Expiration date</span>
              <input
                type="text"
                value={record.expirationDate}
                placeholder="YYYY-MM-DD"
                onChange={(event) => updateRecord(index, { expirationDate: event.target.value })}
              />
            </label>

            <label className="sample-record-wide">
              <span>Territories</span>
              <input
                type="text"
                value={record.territories.join(", ")}
                placeholder="worldwide, United States"
                onChange={(event) => updateRecord(index, { territories: commaSeparatedValues(event.target.value) })}
              />
            </label>

            <label className="sample-record-full">
              <span>Administrative notes</span>
              <textarea
                rows={2}
                value={record.notes}
                onChange={(event) => updateRecord(index, { notes: event.target.value })}
              />
            </label>
          </div>

          <button
            type="button"
            className="performer-remove-button"
            onClick={() => onChange(records.filter((_, recordIndex) => recordIndex !== index))}
          >
            Remove clearance record
          </button>
        </fieldset>
      ))}

      <button
        type="button"
        className="performer-add-button"
        disabled={sampleCount === 0}
        title={sampleCount === 0 ? "Add a sample relationship first." : undefined}
        onClick={() =>
          onChange([
            ...records,
            {
              key: `new-sample-clearance-${Date.now()}-${records.length}`,
              sourceIndex: null,
              sampleReference: Math.min(records.length + 1, Math.max(sampleCount, 1)),
              status: "not reviewed",
              masterUseCleared: false,
              publishingCleared: false,
              agreementReference: "",
              territories: [],
              expirationDate: "",
              notes: "",
            },
          ])
        }
      >
        <span aria-hidden="true">+</span>
        <span>Add clearance record</span>
      </button>
    </div>
  );
}
