import {
  workflowAvailabilityLabels,
  workflowDerivativeStatuses,
  workflowFaqItems,
  workflowLifecycleStatuses,
  workflowPath,
  workflowStages,
  workflowTroubleshootingItems,
} from "./workflow-help-content.js";

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
          <p className="eyebrow">Maintained guide</p>
          <h2 id="workflow-help-heading">
            Release workflow
          </h2>
          <p>
            Follow one release from private source files
            through metadata authoring, derivative
            preparation, validation, and public
            deployment.
          </p>
        </div>

        <button type="button" onClick={onBack}>
          Back to editor
        </button>
      </header>

      <p className="workflow-path">{workflowPath}</p>

      <aside className="workflow-help-notice">
        <strong>Implementation status matters.</strong>
        <p>
          This desktop-first guide distinguishes features
          available now from planning-only and future
          stages. Update it whenever the application
          workflow changes.
        </p>
      </aside>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">Release pipeline</p>
          <h2>Workflow stages</h2>
          <p>
            Each row describes the purpose, operator steps,
            availability, and current implementation state.
          </p>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-table workflow-stage-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Stage</th>
                <th scope="col">Availability</th>
                <th scope="col">Purpose</th>
                <th scope="col">Operator steps</th>
                <th scope="col">Current state</th>
              </tr>
            </thead>
            <tbody>
              {workflowStages.map((stage, index) => (
                <tr key={stage.id} id={`workflow-${stage.id}`}>
                  <td className="workflow-stage-index">
                    {index + 1}
                  </td>
                  <th scope="row">{stage.title}</th>
                  <td>
                    <span
                      className={`workflow-availability ${stage.availability}`}
                    >
                      {
                        workflowAvailabilityLabels[
                          stage.availability
                        ]
                      }
                    </span>
                  </td>
                  <td>{stage.summary}</td>
                  <td className="workflow-stage-steps">
                    <ol>
                      {stage.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </td>
                  <td>{stage.currentNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">Status reference</p>
          <h2>Lifecycle and derivative statuses</h2>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-table workflow-status-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {workflowLifecycleStatuses.map(
                ({ term, definition }) => (
                  <tr key={`lifecycle-${term}`}>
                    <td>Release lifecycle</td>
                    <th scope="row">{term}</th>
                    <td>{definition}</td>
                  </tr>
                ),
              )}
              {workflowDerivativeStatuses.map(
                ({ term, definition }) => (
                  <tr key={`derivative-${term}`}>
                    <td>Media derivative</td>
                    <th scope="row">{term}</th>
                    <td>{definition}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">Storage boundary</p>
          <h2>Private workspace and public output</h2>
          <p>
            The private release remains canonical. Public
            output is a reproducible, sanitized deployment
            build.
          </p>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-table workflow-storage-table">
            <thead>
              <tr>
                <th scope="col">Concern</th>
                <th scope="col">Private canonical release</th>
                <th scope="col">Public deployment output</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Purpose</th>
                <td>
                  Authoring, correction, regeneration,
                  audit, and reproducible publishing.
                </td>
                <td>
                  Validated files consumed by the public
                  audio player and website.
                </td>
              </tr>
              <tr>
                <th scope="row">Include</th>
                <td>
                  Lossless audio masters, artwork masters,
                  editable TOML, source documents, and
                  internal metadata.
                </td>
                <td>
                  Playback audio, waveform JSON, web
                  artwork, and only player-required
                  metadata.
                </td>
              </tr>
              <tr>
                <th scope="row">Exclude</th>
                <td>
                  Nothing required for a reproducible
                  rebuild should be discarded.
                </td>
                <td>
                  Archival masters, private notes,
                  contracts, source documents, logs, and
                  editor-only configuration.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">Common questions</p>
          <h2>FAQ</h2>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-table workflow-faq-table">
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Guidance</th>
              </tr>
            </thead>
            <tbody>
              {workflowFaqItems.map(({ question, answer }) => (
                <tr key={question}>
                  <th scope="row">{question}</th>
                  <td>{answer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workflow-reference-section">
        <header>
          <p className="eyebrow">Operational help</p>
          <h2>Troubleshooting</h2>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-table workflow-troubleshooting-table">
            <thead>
              <tr>
                <th scope="col">Situation</th>
                <th scope="col">Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {workflowTroubleshootingItems.map(
                ({ title, description }) => (
                  <tr key={title}>
                    <th scope="row">{title}</th>
                    <td>{description}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
