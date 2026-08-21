import {
  useEffect,
  useId,
  useState,
} from "react";

import {
  buildReleaseAboutDescription,
  countReleaseProfileSelections,
  getReleaseAboutPlaceholders,
  getReleaseAboutProfileSuggestions,
  getReleaseAboutSuggestions,
  prefillReleaseAboutValuesFromProfile,
  releaseAboutTemplates,
  releaseProfileCategories,
  type ReleaseProfileCategoryId,
  type ReleaseProfileSelection,
} from "./release-about-generator.js";

import {
  hydrateReleaseProfileFromStorage,
  serializeReleaseProfileToStorage,
} from "./release-profile-persistence.js";
import {
  EditorialDescriptorBrowser,
} from "./EditorialDescriptorBrowser.js";
import {
  getReleaseProfileCategoryForDescriptor,
  getReleaseProfileDescriptorScope,
} from "./release-profile-descriptor-scope.js";
import type {
  ReleaseEditorialStorageSnapshot,
} from "../shared/editorial-profile.js";

type GeneratorStage = "profile" | "template";

type ReleaseProfileGroup = {
  id: string;
  label: string;
  categoryIds: readonly ReleaseProfileCategoryId[];
};

const releaseProfileGroups: readonly ReleaseProfileGroup[] = [
  {
    id: "style-sound",
    label: "Style & sound",
    categoryIds: [
      "genres",
      "influences",
      "direction",
      "elements",
      "instrumentation",
      "production",
    ],
  },
  {
    id: "composition",
    label: "Composition",
    categoryIds: [
      "harmony-theory",
      "rhythm",
      "songwriting",
      "performance",
    ],
  },
  {
    id: "character",
    label: "Character",
    categoryIds: [
      "moods-emotions",
      "qualities",
      "themes",
      "identity",
    ],
  },
  {
    id: "context",
    label: "Context",
    categoryIds: ["context", "place"],
  },
];

function addProfileValue(
  profile: ReleaseProfileSelection,
  categoryId: ReleaseProfileCategoryId,
  value: string,
): ReleaseProfileSelection {
  const normalized = value.trim();
  if (!normalized) {
    return profile;
  }

  const current = profile[categoryId] ?? [];
  if (current.includes(normalized)) {
    return profile;
  }

  return {
    ...profile,
    [categoryId]: [...current, normalized],
  };
}

function removeProfileValue(
  profile: ReleaseProfileSelection,
  categoryId: ReleaseProfileCategoryId,
  value: string,
): ReleaseProfileSelection {
  const current = profile[categoryId] ?? [];
  const next = current.filter((entry) => entry !== value);

  return {
    ...profile,
    [categoryId]: next,
  };
}

export function ReleaseAboutGenerator({
  artistName,
  releaseTitle,
  currentDescription,
  profileStorageKey,
  editorialSnapshot,
  onEditorialSnapshotChange,
  onUse,
}: {
  artistName: string;
  releaseTitle: string;
  currentDescription: string;
  profileStorageKey: string;
  editorialSnapshot: ReleaseEditorialStorageSnapshot;
  onEditorialSnapshotChange: (
    nextSnapshot: ReleaseEditorialStorageSnapshot,
  ) => void;
  onUse: (value: string) => void;
}) {
  const tooltipPrefix = useId().replace(/:/g, "");
  const [expanded, setExpanded] =
    useState(false);
  const [stage, setStage] =
    useState<GeneratorStage>("profile");
  const hydratedProfile =
    hydrateReleaseProfileFromStorage(
      editorialSnapshot,
    );
  const profile = hydratedProfile.profile;
  const requestedTemplate =
    releaseAboutTemplates.find(
      (template) =>
        template.id ===
        editorialSnapshot.descriptionStyle,
    );
  const templateId =
    requestedTemplate?.id ??
    releaseAboutTemplates[0].id;
  const [values, setValues] = useState<
    Record<string, string>
  >({
    Artist: artistName,
    Release: releaseTitle,
  });
  const [customProfileValues, setCustomProfileValues] =
    useState<Partial<Record<ReleaseProfileCategoryId, string>>>({});
  const [openCustomEditors, setOpenCustomEditors] =
    useState<Partial<Record<ReleaseProfileCategoryId, boolean>>>({});
  const [activeDescriptorBrowser, setActiveDescriptorBrowser] =
    useState<ReleaseProfileCategoryId | null>(null);

  useEffect(() => {
    setValues((current) => ({
      ...current,
      Artist: artistName,
      Release: releaseTitle,
    }));
  }, [artistName, releaseTitle]);


  useEffect(() => {
    setValues({
      Artist: artistName,
      Release: releaseTitle,
    });
    setStage("profile");
    setCustomProfileValues({});
    setOpenCustomEditors({});
    setActiveDescriptorBrowser(null);
  }, [profileStorageKey]);

  const selectedTemplate =
    releaseAboutTemplates.find(
      (template) => template.id === templateId,
    ) ?? releaseAboutTemplates[0];

  const placeholders = getReleaseAboutPlaceholders(
    selectedTemplate.template,
  );

  const unresolvedPlaceholders = placeholders.filter(
    (placeholder) => !values[placeholder]?.trim(),
  );

  const generatedDescription = buildReleaseAboutDescription(
    selectedTemplate.template,
    values,
  );

  const profileSelectionCount =
    countReleaseProfileSelections(profile);

  const commitProfile = (
    nextProfile: ReleaseProfileSelection,
    preserveUnknownDescriptorIds = true,
  ) => {
    onEditorialSnapshotChange(
      serializeReleaseProfileToStorage({
        profile: nextProfile,
        descriptionStyle: templateId,
        passthroughDescriptorIds:
          preserveUnknownDescriptorIds
            ? hydratedProfile.passthroughDescriptorIds
            : {},
      }),
    );
  };

  const resetFields = () => {
    setValues({
      Artist: artistName,
      Release: releaseTitle,
    });
  };

  const prefillFromProfile = () => {
    setValues((current) =>
      prefillReleaseAboutValuesFromProfile(
        selectedTemplate.template,
        current,
        profile,
      ),
    );
  };

  const selectTemplate = (nextTemplateId: string) => {
    const nextTemplate =
      releaseAboutTemplates.find(
        (template) => template.id === nextTemplateId,
      ) ?? releaseAboutTemplates[0];

    onEditorialSnapshotChange(
      serializeReleaseProfileToStorage({
        profile,
        descriptionStyle: nextTemplate.id,
        passthroughDescriptorIds:
          hydratedProfile.passthroughDescriptorIds,
      }),
    );
    setValues((current) =>
      prefillReleaseAboutValuesFromProfile(
        nextTemplate.template,
        current,
        profile,
      ),
    );
  };

  const submitCustomProfileValue = (
    categoryId: ReleaseProfileCategoryId,
  ) => {
    const customValue = customProfileValues[categoryId] ?? "";
    if (!customValue.trim()) {
      return;
    }

    commitProfile(
      addProfileValue(
        profile,
        categoryId,
        customValue,
      ),
    );
    setCustomProfileValues((current) => ({
      ...current,
      [categoryId]: "",
    }));
    setOpenCustomEditors((current) => ({
      ...current,
      [categoryId]: false,
    }));
  };

  const useGeneratedDescription = () => {
    if (unresolvedPlaceholders.length > 0) {
      return;
    }

    if (
      currentDescription.trim() &&
      currentDescription.trim() !== generatedDescription.trim() &&
      !window.confirm(
        "Replace the current Release Description with the generated text?",
      )
    ) {
      return;
    }

    onUse(generatedDescription);
  };

  return (
    <section
      className="release-about-generator"
      data-expanded={expanded ? "true" : "false"}
      data-stage={stage}
    >
      <header className="release-about-generator__header">
        <span>
          <strong>Release About Generator</strong>
          <small>
            Build a reusable Release Profile, then apply it to editorial
            templates.
          </small>
        </span>

        <button
          type="button"
          className="release-about-generator__toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Hide generator" : "Open generator"}
        </button>
      </header>

      {expanded && (
        <div className="release-about-generator__body">
          <nav
            className="release-about-generator__stage-tabs"
            aria-label="Release About Generator stages"
          >
            <button
              type="button"
              className={stage === "profile" ? "active" : ""}
              onClick={() => setStage("profile")}
            >
              <span>1. Release Profile</span>
              <small>{profileSelectionCount} selected</small>
            </button>
            <button
              type="button"
              className={stage === "template" ? "active" : ""}
              onClick={() => setStage("template")}
            >
              <span>2. About Template</span>
              <small>{selectedTemplate.label.replace(/^\d+\.\s*/, "")}</small>
            </button>
          </nav>

          {stage === "profile" ? (
            <section className="release-profile-editor">
              <header className="release-profile-editor__intro">
                <span>
                  <strong>Reusable descriptor pool</strong>
                  <small>
                    Describe the music once; reuse those choices across every
                    editorial template.
                  </small>
                </span>
                <span className="release-profile-editor__milestone">
                  Canonical Release Profile
                </span>
              </header>

              <p className="release-profile-editor__notice">
                Profile selections and template style are staged with normal
                metadata edits and saved canonically in release.toml.
              </p>

              <div className="release-profile-editor__groups">
                {releaseProfileGroups.map((group) => {
                  const categories = releaseProfileCategories.filter(
                    (category) => group.categoryIds.includes(category.id),
                  );

                  return (
                    <section
                      key={group.id}
                      className="release-profile-editor__group"
                    >
                      <h3>{group.label}</h3>

                      <div className="release-profile-editor__categories">
                        {categories.map((category) => {
                          const selected = profile[category.id] ?? [];
                          const customValue =
                            customProfileValues[category.id] ?? "";
                          const customEditorOpen = Boolean(
                            openCustomEditors[category.id],
                          );
                          const tooltipId =
                            `${tooltipPrefix}-${category.id}-help`;
                          return (
                            <section
                              key={category.id}
                              className="release-profile-editor__category"
                            >
                              <header>
                                <span className="release-profile-editor__category-title">
                                  <strong>{category.label}</strong>
                                  <button
                                    type="button"
                                    className="release-profile-editor__info"
                                    aria-label={`${category.label}: ${category.description}`}
                                    aria-describedby={tooltipId}
                                  >
                                    ?
                                  </button>
                                  <span
                                    id={tooltipId}
                                    role="tooltip"
                                    className="release-profile-editor__tooltip"
                                  >
                                    {category.description}
                                  </span>
                                </span>
                              </header>

                              <button
                                type="button"
                                className="release-profile-editor__browse"
                                onClick={() =>
                                  setActiveDescriptorBrowser(category.id)
                                }
                              >
                                <span>Browse descriptors</span>
                                <small>
                                  Search or browse by family and subfamily
                                </small>
                                <strong>
                                  {selected.length > 0
                                    ? `${selected.length} selected`
                                    : "Choose…"}
                                </strong>
                              </button>

                              {selected.length > 0 && (
                                <div className="release-profile-editor__chips">
                                  {selected.map((value) => (
                                    <button
                                      key={value}
                                      type="button"
                                      className="release-profile-editor__chip"
                                      title={`Remove ${value}`}
                                      onClick={() =>
                                        commitProfile(
                                          removeProfileValue(
                                            profile,
                                            category.id,
                                            value,
                                          ),
                                        )
                                      }
                                    >
                                      {value}
                                      <span aria-hidden="true">×</span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              {customEditorOpen ? (
                                <div className="release-profile-editor__custom-row">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={customValue}
                                    placeholder="Custom descriptor"
                                    aria-label={`Custom ${category.label}`}
                                    onChange={(event) =>
                                      setCustomProfileValues((current) => ({
                                        ...current,
                                        [category.id]: event.target.value,
                                      }))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Escape") {
                                        setOpenCustomEditors((current) => ({
                                          ...current,
                                          [category.id]: false,
                                        }));
                                        return;
                                      }
                                      if (event.key !== "Enter") {
                                        return;
                                      }
                                      event.preventDefault();
                                      submitCustomProfileValue(category.id);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={!customValue.trim()}
                                    onClick={() =>
                                      submitCustomProfileValue(category.id)
                                    }
                                  >
                                    Add
                                  </button>
                                  <button
                                    type="button"
                                    className="release-profile-editor__custom-cancel"
                                    onClick={() =>
                                      setOpenCustomEditors((current) => ({
                                        ...current,
                                        [category.id]: false,
                                      }))
                                    }
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="release-profile-editor__custom-toggle"
                                  onClick={() =>
                                    setOpenCustomEditors((current) => ({
                                      ...current,
                                      [category.id]: true,
                                    }))
                                  }
                                >
                                  + Custom descriptor
                                </button>
                              )}
                            </section>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="release-profile-editor__footer">
                <span>
                  <strong>{profileSelectionCount}</strong>
                  {" "}
                  descriptor{profileSelectionCount === 1 ? "" : "s"} selected
                </span>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      commitProfile({}, false)
                    }
                    disabled={profileSelectionCount === 0}
                  >
                    Clear profile
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setStage("template");
                      setValues((current) =>
                        prefillReleaseAboutValuesFromProfile(
                          selectedTemplate.template,
                          current,
                          profile,
                        ),
                      );
                    }}
                  >
                    Continue to template →
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="release-about-generator__template-stage">
              <div className="release-about-generator__template-toolbar">
                <label className="release-about-generator__template">
                  <span>Template</span>
                  <select
                    value={templateId}
                    onChange={(event) =>
                      selectTemplate(event.target.value)
                    }
                  >
                    {releaseAboutTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                  <small>
                    {selectedTemplate.description} Profile values fill only
                    empty fields; every generated value remains editable.
                  </small>
                </label>

                <div className="release-about-generator__profile-prefill">
                  <strong>{profileSelectionCount}</strong>
                  <span>profile descriptors available</span>
                  <button
                    type="button"
                    disabled={profileSelectionCount === 0}
                    onClick={prefillFromProfile}
                  >
                    Prefill empty fields
                  </button>
                </div>
              </div>

              <div className="release-about-generator__fields">
                {placeholders.map((placeholder, index) => {
                  const profileSuggestions =
                    getReleaseAboutProfileSuggestions(
                      placeholder,
                      profile,
                    );
                  const suggestions = getReleaseAboutSuggestions(placeholder);
                  const inputId =
                    `release-about-${selectedTemplate.id}-${index}`;
                  const currentValue = values[placeholder] ?? "";
                  const selectedProfileValue =
                    profileSuggestions.includes(currentValue)
                      ? currentValue
                      : "";

                  const chooseValue = (value: string) => {
                    if (!value) {
                      return;
                    }
                    setValues((current) => ({
                      ...current,
                      [placeholder]: value,
                    }));
                  };

                  return (
                    <div
                      key={placeholder}
                      className="release-about-generator__field"
                    >
                      <label htmlFor={inputId}>[{placeholder}]</label>
                      <input
                        id={inputId}
                        type="text"
                        value={currentValue}
                        placeholder={`Enter ${placeholder}`}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [placeholder]: event.target.value,
                          }))
                        }
                      />

                      {(profileSuggestions.length > 0 ||
                        suggestions.length > 0) && (
                        <div className="release-about-generator__choice-row">
                          {profileSuggestions.length > 0 && (
                            <select
                              className="release-about-generator__profile-select"
                              value={selectedProfileValue}
                              aria-label={`Release Profile choices for ${placeholder}`}
                              onChange={(event) =>
                                chooseValue(event.target.value)
                              }
                            >
                              <option value="">Profile…</option>
                              {profileSuggestions.map((suggestion) => (
                                <option key={suggestion} value={suggestion}>
                                  {suggestion}
                                </option>
                              ))}
                            </select>
                          )}

                          {suggestions.length > 0 && (
                            <select
                              className="release-about-generator__suggestion-select"
                              value=""
                              aria-label={`More suggestions for ${placeholder}`}
                              onChange={(event) =>
                                chooseValue(event.target.value)
                              }
                            >
                              <option value="">More…</option>
                              {suggestions.map((suggestion) => (
                                <option key={suggestion} value={suggestion}>
                                  {suggestion}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="release-about-generator__preview">
                <strong>Preview</strong>
                <p>{generatedDescription}</p>
                <small>
                  {unresolvedPlaceholders.length > 0
                    ? `${unresolvedPlaceholders.length} field${
                        unresolvedPlaceholders.length === 1 ? "" : "s"
                      } remaining`
                    : "Ready to use"}
                </small>
              </div>

              <div className="release-about-generator__actions">
                <button type="button" onClick={() => setStage("profile")}>
                  Edit Release Profile
                </button>
                <button type="button" onClick={resetFields}>
                  Reset template fields
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={unresolvedPlaceholders.length > 0}
                  onClick={useGeneratedDescription}
                >
                  Use generated description
                </button>
              </div>

              <small className="release-about-generator__save-note">
                This only fills Release Description. Use the normal metadata
                Save action to write the change.
              </small>
            </section>
          )}

          {activeDescriptorBrowser && (() => {
            const activeCategory =
              releaseProfileCategories.find(
                (category) =>
                  category.id === activeDescriptorBrowser,
              );
            const scope =
              getReleaseProfileDescriptorScope(
                activeDescriptorBrowser,
              );

            return (
              <EditorialDescriptorBrowser
                title={
                  activeCategory?.label ??
                  "Descriptor Browser"
                }
                description={
                  activeCategory?.description ?? ""
                }
                ontologyCategories={scope}
                selectedCount={profileSelectionCount}
                isSelected={(descriptor) => {
                  const ownerCategory =
                    getReleaseProfileCategoryForDescriptor(
                      descriptor,
                    );

                  return Boolean(
                    profile[ownerCategory]?.includes(
                      descriptor.label,
                    ),
                  );
                }}
                onToggleDescriptor={(descriptor) => {
                  const ownerCategory =
                    getReleaseProfileCategoryForDescriptor(
                      descriptor,
                    );
                  const selected =
                    profile[ownerCategory]?.includes(
                      descriptor.label,
                    ) ?? false;

                  commitProfile(
                    selected
                      ? removeProfileValue(
                          profile,
                          ownerCategory,
                          descriptor.label,
                        )
                      : addProfileValue(
                          profile,
                          ownerCategory,
                          descriptor.label,
                        ),
                  );
                }}
                onClose={() =>
                  setActiveDescriptorBrowser(null)
                }
              />
            );
          })()}
        </div>
      )}
    </section>
  );
}
