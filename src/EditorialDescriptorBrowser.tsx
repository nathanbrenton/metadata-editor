import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getEditorialDescriptorBrowserCategoryCount,
  getEditorialDescriptorBrowserCategoryDefinitions,
  getEditorialDescriptorBrowserDefinition,
  getEditorialDescriptorBrowserFamilies,
  getEditorialDescriptorBrowserPath,
  getEditorialDescriptorBrowserRelated,
  getEditorialDescriptorBrowserResults,
  getEditorialDescriptorBrowserSubfamilies,
  type EditorialDescriptorBrowserLevel,
} from "./editorial-descriptor-browser.js";
import type {
  ReleaseDescriptor,
  ReleaseDescriptorCategoryId,
} from "./release-descriptor-ontology.js";

export function EditorialDescriptorBrowser({
  title,
  description,
  ontologyCategories,
  selectedCount,
  isSelected,
  onToggleDescriptor,
  onClose,
}: {
  title: string;
  description: string;
  ontologyCategories: readonly ReleaseDescriptorCategoryId[];
  selectedCount: number;
  isSelected: (descriptor: ReleaseDescriptor) => boolean;
  onToggleDescriptor: (descriptor: ReleaseDescriptor) => void;
  onClose: () => void;
}) {
  const categoryDefinitions = useMemo(
    () =>
      getEditorialDescriptorBrowserCategoryDefinitions(
        ontologyCategories,
      ),
    [ontologyCategories],
  );
  const [query, setQuery] = useState("");
  const [level, setLevel] =
    useState<EditorialDescriptorBrowserLevel>(
      "common",
    );
  const [ontologyCategory, setOntologyCategory] =
    useState<ReleaseDescriptorCategoryId>(
      categoryDefinitions[0]?.id ?? "genre",
    );
  const [family, setFamily] = useState("");
  const [subfamily, setSubfamily] =
    useState("");
  const [focusedDescriptor, setFocusedDescriptor] =
    useState<ReleaseDescriptor | null>(null);

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [onClose]);

  useEffect(() => {
    setQuery("");
    setLevel("common");
    setOntologyCategory(
      categoryDefinitions[0]?.id ?? "genre",
    );
    setFamily("");
    setSubfamily("");
    setFocusedDescriptor(null);
  }, [categoryDefinitions]);

  const families =
    getEditorialDescriptorBrowserFamilies({
      ontologyCategories,
      ontologyCategory,
      level,
    });
  const subfamilies =
    getEditorialDescriptorBrowserSubfamilies({
      ontologyCategories,
      ontologyCategory,
      family,
      level,
    });
  const results =
    getEditorialDescriptorBrowserResults({
      ontologyCategories,
      ontologyCategory,
      family,
      subfamily,
      level,
      query,
    });
  const related = focusedDescriptor
    ? getEditorialDescriptorBrowserRelated(
        focusedDescriptor,
      )
    : [];

  const toggleDescriptor = (
    descriptor: ReleaseDescriptor,
  ) => {
    onToggleDescriptor(descriptor);
    setFocusedDescriptor(descriptor);
  };

  return (
    <div
      className="release-descriptor-browser__backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="release-descriptor-browser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-descriptor-browser-title"
      >
        <header className="release-descriptor-browser__header">
          <span>
            <strong id="release-descriptor-browser-title">
              {title}
            </strong>
            <small>{description}</small>
          </span>

          <span className="release-descriptor-browser__header-actions">
            <small>
              {selectedCount} profile descriptor
              {selectedCount === 1 ? "" : "s"} selected
            </small>
            <button
              type="button"
              onClick={onClose}
            >
              Done
            </button>
          </span>
        </header>

        <div className="release-descriptor-browser__search-row">
          <label>
            <span>Search</span>
            <input
              type="search"
              autoFocus
              value={query}
              placeholder="Search labels, aliases, families, or related terms…"
              onChange={(event) =>
                setQuery(event.target.value)
              }
            />
          </label>

          <div
            className="release-descriptor-browser__level-filter"
            aria-label="Descriptor complexity"
          >
            {(
              [
                ["common", "Common"],
                ["all", "All"],
                ["advanced", "Advanced"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  level === value ? "active" : ""
                }
                aria-pressed={level === value}
                onClick={() => {
                  setLevel(value);
                  setFamily("");
                  setSubfamily("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!query && (
          <div className="release-descriptor-browser__taxonomy">
            <aside className="release-descriptor-browser__rail">
              {categoryDefinitions.length > 1 && (
                <div className="release-descriptor-browser__rail-group">
                  <strong>Type</strong>
                  {categoryDefinitions.map(
                    (definition) => (
                      <button
                        key={definition.id}
                        type="button"
                        className={
                          ontologyCategory === definition.id
                            ? "active"
                            : ""
                        }
                        onClick={() => {
                          setOntologyCategory(
                            definition.id,
                          );
                          setFamily("");
                          setSubfamily("");
                        }}
                      >
                        <span>{definition.label}</span>
                        <small>
                          {getEditorialDescriptorBrowserCategoryCount(
                            ontologyCategories,
                            definition.id,
                            level,
                          )}
                        </small>
                      </button>
                    ),
                  )}
                </div>
              )}

              <div className="release-descriptor-browser__rail-group">
                <strong>Family</strong>
                <button
                  type="button"
                  className={!family ? "active" : ""}
                  onClick={() => {
                    setFamily("");
                    setSubfamily("");
                  }}
                >
                  <span>All families</span>
                  <small>
                    {getEditorialDescriptorBrowserCategoryCount(
                      ontologyCategories,
                      ontologyCategory,
                      level,
                    )}
                  </small>
                </button>
                {families.map((entry) => (
                  <button
                    key={entry.label}
                    type="button"
                    className={
                      family === entry.label
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setFamily(entry.label);
                      setSubfamily("");
                    }}
                  >
                    <span>{entry.label}</span>
                    <small>{entry.count}</small>
                  </button>
                ))}
              </div>
            </aside>

            <aside className="release-descriptor-browser__subfamily">
              <strong>Subfamily</strong>
              {!family ? (
                <p>
                  Choose a family to narrow the vocabulary, or browse all
                  descriptors at right.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className={!subfamily ? "active" : ""}
                    onClick={() => setSubfamily("")}
                  >
                    All {family}
                  </button>
                  {subfamilies.map((entry) => (
                    <button
                      key={entry.label}
                      type="button"
                      className={
                        subfamily === entry.label
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setSubfamily(entry.label)
                      }
                    >
                      <span>{entry.label}</span>
                      <small>{entry.count}</small>
                    </button>
                  ))}
                </>
              )}
            </aside>

            <DescriptorResults
              results={results}
              query={query}
              isSelected={isSelected}
              onToggle={toggleDescriptor}
              onInspect={setFocusedDescriptor}
            />
          </div>
        )}

        {query && (
          <div className="release-descriptor-browser__search-results">
            <DescriptorResults
              results={results}
              query={query}
              isSelected={isSelected}
              onToggle={toggleDescriptor}
              onInspect={setFocusedDescriptor}
            />
          </div>
        )}

        {focusedDescriptor && (
          <footer className="release-descriptor-browser__related">
            <span>
              <strong>
                Related to {focusedDescriptor.label}
              </strong>
              <small>
                Related descriptors may belong to another editorial profile
                category.
              </small>
            </span>
            <div>
              {related.length > 0 ? (
                related.map((descriptor) => {
                  const selected =
                    isSelected(descriptor);

                  return (
                    <button
                      key={descriptor.id}
                      type="button"
                      className={
                        selected ? "selected" : ""
                      }
                      title={
                        getEditorialDescriptorBrowserPath(
                          descriptor,
                        )
                      }
                      aria-label={`${
                        selected ? "Remove" : "Add"
                      } ${descriptor.label}. ${
                        getEditorialDescriptorBrowserDefinition(
                          descriptor,
                        )
                      }. Taxonomy path: ${
                        getEditorialDescriptorBrowserPath(
                          descriptor,
                        )
                      }`}
                      onClick={() =>
                        toggleDescriptor(descriptor)
                      }
                    >
                      <span aria-hidden="true">
                        {selected ? "✓" : "+"}
                      </span>
                      <span>
                        <strong>{descriptor.label}</strong>
                        <small>
                          {getEditorialDescriptorBrowserDefinition(
                            descriptor,
                          )}
                        </small>
                      </span>
                    </button>
                  );
                })
              ) : (
                <small>No related descriptors are mapped yet.</small>
              )}
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

function DescriptorResults({
  results,
  query,
  isSelected,
  onToggle,
  onInspect,
}: {
  results: readonly ReleaseDescriptor[];
  query: string;
  isSelected: (descriptor: ReleaseDescriptor) => boolean;
  onToggle: (descriptor: ReleaseDescriptor) => void;
  onInspect: (descriptor: ReleaseDescriptor) => void;
}) {
  return (
    <section className="release-descriptor-browser__results">
      <header>
        <strong>
          {query ? "Search results" : "Descriptors"}
        </strong>
        <small>{results.length} shown</small>
      </header>

      <div className="release-descriptor-browser__result-list">
        {results.length > 0 ? (
          results.map((descriptor) => {
            const selected =
              isSelected(descriptor);

            const path =
              getEditorialDescriptorBrowserPath(
                descriptor,
              );
            const definition =
              getEditorialDescriptorBrowserDefinition(
                descriptor,
              );

            return (
              <article
                key={descriptor.id}
                className={
                  `release-descriptor-browser__result${
                    selected ? " selected" : ""
                  }`
                }
              >
                <button
                  type="button"
                  className="release-descriptor-browser__result-toggle"
                  aria-pressed={selected}
                  aria-label={`${
                    selected ? "Remove" : "Add"
                  } ${descriptor.label}. ${definition}. Taxonomy path: ${path}`}
                  onClick={() => onToggle(descriptor)}
                >
                  <span aria-hidden="true">
                    {selected ? "✓" : "+"}
                  </span>
                  <span className="release-descriptor-browser__result-copy">
                    <span className="release-descriptor-browser__result-heading">
                      <strong>{descriptor.label}</strong>
                      <span
                        className="release-descriptor-browser__path-help"
                        aria-hidden="true"
                        title={path}
                      >
                        ?
                      </span>
                    </span>
                    <small>{definition}</small>
                  </span>
                  {descriptor.level === "advanced" && (
                    <em>Advanced</em>
                  )}
                </button>

                <button
                  type="button"
                  className="release-descriptor-browser__inspect"
                  aria-label={`Show related descriptors for ${descriptor.label}`}
                  title={`Show related descriptors for ${descriptor.label}`}
                  onClick={() => onInspect(descriptor)}
                >
                  Related
                </button>
              </article>
            );
          })
        ) : (
          <p className="release-descriptor-browser__empty">
            No descriptors match these filters.
          </p>
        )}
      </div>
    </section>
  );
}
