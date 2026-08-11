import {
  workflowPath,
} from "./workflow-help-content.js";

const workspaceRows = [
  {
    name: "Ingest",
    purpose: "Inspect source files without changing them.",
    action:
      "Refresh Ingest, review candidate evidence, previews, sidecars, and file-format guidance.",
  },
  {
    name: "Staging",
    purpose: "Review the exact create/update plan.",
    action:
      "Choose the candidate and optional existing-release target, then verify identity, order, artwork, masters, metadata, and guarded changes.",
  },
  {
    name: "Library",
    purpose: "Author the private canonical release.",
    action:
      "Edit release/track/video metadata, review inheritance, provenance, readiness, masters, and private derivatives.",
  },
  {
    name: "Publish",
    purpose: "Prepare and build sanitized public output.",
    action:
      "Run preflight, prepare current web derivatives, then publish or update the complete public snapshot.",
  },
] as const;

const quickQuestions = [
  {
    question: "Where do the files live?",
    answer:
      "ingest-drop is disposable source input. media-library is the sizeable private canonical source of truth. published-media is generated sanitized deployment output that can be rebuilt from the Library.",
  },
  {
    question: "What does Preferred vs Compatible mean?",
    answer:
      "Preferred is the current archival happy path. Compatible sources remain accepted and are preserved without silent conversion; compatibility alone is not a Publish blocker.",
  },
  {
    question: "How are updates kept safe?",
    answer:
      "Staging, identity/directory changes, preparation, and publication use reviewed plans, collision checks, stale-plan detection, verification, backups where needed, atomic promotion, and rollback protection.",
  },
  {
    question: "How do revisions work?",
    answer:
      "A later ingest candidate can target an existing release. Omitted existing tracks/videos are preserved unless a separate reviewed removal workflow says otherwise. Sidecars and artwork can also be introduced as later revision evidence.",
  },
  {
    question: "What do readiness and provenance mean?",
    answer:
      "Readiness is color-coded operational feedback: green Ready, amber Review, and red Blocked. Provenance remains separate and explains where an effective metadata value came from, such as Stored, Inherited, or Generated.",
  },
  {
    question: "Where is metadata field and tag help?",
    answer:
      "Use the ? help controls beside metadata fields for contextual guidance, or open Metadata Tag Info from the footer for the broader tag/player reference. The hamburger stays focused on application-level controls.",
  },
  {
    question: "What are the hover explanations in Ingest?",
    answer:
      "They are tooltips. Short section guidance now lives on hover/focus so Target release, identity detection, inferred metadata, and source inspection stay compact.",
  },
  {
    question: "Where does technical media health appear in the workflow?",
    answer:
      "Library and Publish show compact Technical Ready, Review, or Blocked indicators from one background read-only audit per Library scan. Hover for the advisory preservation-policy summary; technical health does not change Publish gating.",
  },
  {
    question: "What audit commands are available?",
    answer:
      "npm run audit:file-spec reports extension/naming conformance. npm run audit:media-technical uses ffprobe to inventory observed technical characteristics plus per-release probe/consistency health. Both are read-only; technical health does not grade quality or change Publish gating.",
  },
] as const;

export function WorkflowHelpView({
  onBack,
}: {
  onBack: () => void;
}) {
  return (
    <section
      className="workflow-help-view"
      aria-labelledby="workflow-help-heading"
    >
      <header className="workflow-help-hero">
        <div>
          <p className="eyebrow">Quick guide</p>
          <h2 id="workflow-help-heading">
            Workflow &amp; Help
          </h2>
          <p>
            Four workspaces, one private canonical Library,
            and one reproducible public output.
          </p>
        </div>
        <button type="button" onClick={onBack}>
          Back to editor
        </button>
      </header>

      <p className="workflow-path">{workflowPath}</p>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">Four workspaces</p>
          <h2>Release flow</h2>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-table workflow-stage-table">
            <thead>
              <tr>
                <th scope="col">Workspace</th>
                <th scope="col">Purpose</th>
                <th scope="col">Typical action</th>
              </tr>
            </thead>
            <tbody>
              {workspaceRows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{row.purpose}</td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">Current operating model</p>
          <h2>What matters</h2>
        </header>

        <div className="workflow-definition-grid">
          <article>
            <h3>Private → public</h3>
            <p>
              <code>media-library/</code> is canonical.
              <code> published-media/</code> is generated,
              sanitized deployment output.
            </p>
          </article>

          <article>
            <h3>Contextual refresh</h3>
            <p>
              Refresh lives in the top header: Ingest refreshes
              the drop, Staging refreshes both inputs, and
              Library/Publish refresh the Library.
            </p>
          </article>

          <article>
            <h3>Footer storage totals</h3>
            <p>
              The footer reports only total Library and
              Published media sizes. Metadata Tag Info is
              linked there as a separate reference page.
            </p>
          </article>

          <article>
            <h3>Media contract</h3>
            <p>
              Canonical masters keep stable role names and
              source extensions. Preferred vs Compatible is
              guidance, not automatic conversion.
            </p>
          </article>

          <article>
            <h3>Read-only audits</h3>
            <p>
              <code>audit:file-spec</code> checks naming and
              format tiers. <code>audit:media-technical</code>
              inventories actual ffprobe characteristics and
              release-level probe/consistency health.
            </p>
          </article>
        </div>
      </section>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">FAQ</p>
          <h2>Common questions</h2>
        </header>

        <div className="workflow-faq-list">
          {quickQuestions.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </section>
  );
}
