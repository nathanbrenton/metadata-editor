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
    name: "Web Package",
    purpose: "Prepare sanitized releases for the Hiplingo web app.",
    action:
      "Run Ready Check, prepare current web derivatives, then prepare or update the Web Package.",
  },
  {
    name: "Live",
    purpose: "See what Hiplingo visitors can currently access.",
    action:
      "Compare the Web Package with Live, review changes, and keep public writes explicitly gated.",
  },
] as const;

const quickQuestions = [
  {
    question: "Where do the files live?",
    answer:
      "ingest-drop is disposable source input. media-library is the private canonical Library and is never deployed directly. published-media is the generated Web Package. Live is the separately inspected remote public state.",
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
      "Library release detail and Web Package Ready Check share one compact technical inspector. It summarizes canonical-master counts and the observed audio, artwork, and video inventory from the background read-only audit; Technical Media Contract v1 remains advisory and does not change Web Package readiness.",
  },
  {
    question: "What audit commands are available?",
    answer:
      "npm run audit:file-spec reports extension/naming conformance. npm run audit:media-technical uses ffprobe to inventory observed technical characteristics plus per-release probe/consistency health. Both are read-only; technical health does not grade quality or change Publish gating.",
  },
  {
    question: "Where did the Publishing Guide button go?",
    answer:
      "Publication guidance now lives here in Workflow & Help. Web Package owns Ready Check and web preparation; Live owns remote comparison and reviewed deployment changes. The Library never deploys directly.",
  },
  {
    question: "What if the Library changed after a release was published?",
    answer:
      "A packaged release with newer canonical Library inputs becomes Update available. Verify snapshot and Refresh deployment manifest only verify/hash the current local Public Package; they do not copy new Library changes into it. Rebuild the Local Public Package first. Deployment is blocked by default while published releases have pending Library changes; intentionally deploying the older public snapshot requires an explicit override. Not-published Library releases are intentionally excluded and do not block deployment.",
  },
  {
    question: "How do I remove a release from the public catalog?",
    answer:
      "Use Public Package → Review unpublish on an already-packaged release. The first step is a read-only plan that fingerprints the complete public release and catalog state. Confirmed unpublish removes only the sanitized public package and catalog membership; the canonical Library release and masters remain private and unchanged. Then refresh the deployment manifest, Check host, and deploy the reviewed removals to the sandbox or production target.",
  },
  {
    question: "What if an Included release is missing from Library?",
    answer:
      "An Included release can remain in the Web Package even when it is absent from the active Library scan. Metadata Editor never treats that mismatch as permission to delete public content. Review it explicitly and use Review removal only when you intend to remove it from the Web Package and create a future Live removal.",
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
            Five workspaces with explicit boundaries between the private
            Library, generated Web Package, and remote Live state.
          </p>
        </div>
        <button type="button" onClick={onBack}>
          Back to editor
        </button>
      </header>

      <p className="workflow-path">{workflowPath}</p>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">Five workspaces</p>
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
              <code>media-library/</code> is the private canonical Library.
              <code> published-media/</code> is the generated Web Package.
              Live is the separately inspected remote public state.
            </p>
          </article>

          <article>
            <h3>Contextual refresh</h3>
            <p>
              Refresh lives in the top header: Ingest refreshes
              the drop, Staging refreshes both inputs, and
              Library/Web Package refresh the Library; Live inspection uses its own read-only comparison controls.
            </p>
          </article>

          <article>
            <h3>Footer storage totals</h3>
            <p>
              The footer reports only total Library and
              Web Package sizes. Metadata Tag Info is
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
