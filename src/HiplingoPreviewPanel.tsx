import { useMemo, useState } from "react";

type HiplingoPreviewView =
  | "release"
  | "releases"
  | "listen";

type HiplingoPreviewDevice =
  | "desktop"
  | "mobile";

type HiplingoPreviewSource =
  | "working"
  | "web-package"
  | "published";

type HiplingoPreviewLayout =
  | "single"
  | "compare";

const DEFAULT_HIPLINGO_PREVIEW_ORIGIN =
  "http://127.0.0.1:5173";
const DEFAULT_HIPLINGO_PUBLIC_ORIGIN =
  "https://hiplingo.com";

function normalizePreviewOrigin(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = value?.trim().replace(/\/+$/, "");
  return normalized || fallback;
}

function buildPreviewPath(
  view: HiplingoPreviewView,
  releaseId: string,
  selectedTrackKey: string | null,
): string {
  if (view === "releases") {
    return "/releases";
  }

  if (view === "listen") {
    const query = selectedTrackKey
      ? `?track=${encodeURIComponent(selectedTrackKey)}`
      : "";

    return `/listen${query}`;
  }

  return `/releases/${encodeURIComponent(releaseId)}`;
}

function sourceLabel(source: Exclude<HiplingoPreviewSource, "working">): string {
  return source === "web-package"
    ? "Web Package"
    : "Published";
}

function HiplingoPreviewFrame({
  source,
  origin,
  previewPath,
  releaseTitle,
  view,
  device,
  reloadToken,
}: {
  source: Exclude<HiplingoPreviewSource, "working">;
  origin: string;
  previewPath: string;
  releaseTitle: string;
  view: HiplingoPreviewView;
  device: HiplingoPreviewDevice;
  reloadToken: number;
}) {
  const previewUrl = `${origin}${previewPath}`;
  const label = sourceLabel(source);

  return (
    <section
      className="hiplingo-preview-panel__frame"
      aria-label={`${label} Hiplingo preview`}
    >
      <div className="hiplingo-preview-panel__frame-heading">
        <div>
          <span>{label}</span>
          <small>
            {source === "web-package"
              ? "Local sanitized package"
              : "Live hiplingo.com"}
          </small>
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="button-link"
        >
          Open ↗
        </a>
      </div>

      <div
        className={`hiplingo-preview-panel__viewport hiplingo-preview-panel__viewport--${device}`}
      >
        <div className="hiplingo-preview-panel__browser-bar">
          <span aria-hidden="true">● ● ●</span>
          <code>{previewUrl}</code>
        </div>
        <iframe
          key={`${source}:${previewUrl}:${reloadToken}`}
          src={previewUrl}
          title={`${label} Hiplingo ${view} preview for ${releaseTitle}`}
          allow="autoplay; fullscreen"
          sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
        />
      </div>
    </section>
  );
}

export function HiplingoPreviewPanel({
  releaseId,
  releaseTitle,
  selectedTrackKey,
}: {
  releaseId: string;
  releaseTitle: string;
  selectedTrackKey: string | null;
}) {
  const [view, setView] =
    useState<HiplingoPreviewView>("release");
  const [device, setDevice] =
    useState<HiplingoPreviewDevice>("desktop");
  const [source, setSource] =
    useState<HiplingoPreviewSource>("web-package");
  const [layout, setLayout] =
    useState<HiplingoPreviewLayout>("single");
  const [reloadToken, setReloadToken] =
    useState(0);

  const previewOrigin = normalizePreviewOrigin(
    import.meta.env.VITE_HIPLINGO_PREVIEW_ORIGIN,
    DEFAULT_HIPLINGO_PREVIEW_ORIGIN,
  );
  const publicOrigin = normalizePreviewOrigin(
    import.meta.env.VITE_HIPLINGO_PUBLIC_ORIGIN,
    DEFAULT_HIPLINGO_PUBLIC_ORIGIN,
  );
  const previewPath = useMemo(
    () => buildPreviewPath(view, releaseId, selectedTrackKey),
    [view, releaseId, selectedTrackKey],
  );

  const singleSource = source === "published"
    ? "published"
    : "web-package";
  const singleOrigin = singleSource === "published"
    ? publicOrigin
    : previewOrigin;

  return (
    <section
      className="hiplingo-preview-panel"
      aria-label={`Hiplingo preview for ${releaseTitle}`}
    >
      <header className="hiplingo-preview-panel__header">
        <div>
          <span className="hiplingo-preview-panel__eyebrow">
            Hiplingo preview
          </span>
          <h2>{releaseTitle}</h2>
          <p>
            Actual Hiplingo renderer · local package and live production
          </p>
        </div>

        <div
          className="hiplingo-preview-panel__status"
          aria-label="Preview source"
        >
          <span>Source</span>
          <strong>
            {layout === "compare"
              ? "Web Package ↔ Published"
              : sourceLabel(singleSource)}
          </strong>
        </div>
      </header>

      <div className="hiplingo-preview-panel__toolbar">
        <div
          className="hiplingo-preview-panel__segmented"
          aria-label="Hiplingo preview view"
        >
          {([
            ["release", "Release"],
            ["releases", "Releases"],
            ["listen", "Listen"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="hiplingo-preview-panel__segmented"
          aria-label="Hiplingo preview device"
        >
          {([
            ["desktop", "Desktop"],
            ["mobile", "Mobile"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={device === value}
              onClick={() => setDevice(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="hiplingo-preview-panel__segmented"
          aria-label="Hiplingo preview layout"
        >
          {([
            ["single", "Single"],
            ["compare", "Split compare"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              onClick={() => setLayout(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="hiplingo-preview-panel__actions">
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            title="Reload the embedded Hiplingo view"
          >
            Reload
          </button>
        </div>
      </div>

      <div className="hiplingo-preview-panel__source-row">
        <span className="hiplingo-preview-panel__source-label">
          Data source
        </span>
        <div
          className="hiplingo-preview-panel__segmented hiplingo-preview-panel__segmented--source"
          aria-label="Hiplingo preview data source"
        >
          <button
            type="button"
            disabled
            aria-pressed={false}
            title="Working Library preview will be enabled by the local preview bridge in the next phase."
          >
            Working
          </button>
          <button
            type="button"
            disabled={layout === "compare"}
            aria-pressed={
              layout === "single" && source === "web-package"
            }
            onClick={() => setSource("web-package")}
          >
            Web Package
          </button>
          <button
            type="button"
            disabled={layout === "compare"}
            aria-pressed={
              layout === "single" && source === "published"
            }
            onClick={() => setSource("published")}
          >
            Published
          </button>
        </div>
        <span className="hiplingo-preview-panel__source-help">
          {layout === "compare"
            ? "Split compare locks the two panes to Web Package and Published."
            : source === "published"
              ? "Read-only production view from hiplingo.com."
              : "Current sanitized local Web Package rendered by the local Hiplingo dev server."}
        </span>
      </div>

      <div className="hiplingo-preview-panel__notice">
        <strong>Local renderer:</strong>{" "}
        start <code>hiplingo.com</code> with <code>npm run dev</code>.
        Web Package preview intentionally reads Hiplingo&apos;s sanitized
        <code> published-media </code>
        package; private Library files are never exposed to it. Published
        preview is read-only and points at the public site.
      </div>

      {layout === "compare" ? (
        <div
          className={`hiplingo-preview-panel__comparison hiplingo-preview-panel__comparison--${device}`}
        >
          <HiplingoPreviewFrame
            source="web-package"
            origin={previewOrigin}
            previewPath={previewPath}
            releaseTitle={releaseTitle}
            view={view}
            device={device}
            reloadToken={reloadToken}
          />
          <HiplingoPreviewFrame
            source="published"
            origin={publicOrigin}
            previewPath={previewPath}
            releaseTitle={releaseTitle}
            view={view}
            device={device}
            reloadToken={reloadToken}
          />
        </div>
      ) : (
        <HiplingoPreviewFrame
          source={singleSource}
          origin={singleOrigin}
          previewPath={previewPath}
          releaseTitle={releaseTitle}
          view={view}
          device={device}
          reloadToken={reloadToken}
        />
      )}
    </section>
  );
}
