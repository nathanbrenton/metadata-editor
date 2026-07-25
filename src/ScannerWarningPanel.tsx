type ScannerWarningPanelProps = {
  warnings: readonly string[];
};

export function ScannerWarningPanel({
  warnings,
}: ScannerWarningPanelProps) {
  return (
    <section
      className="warning-panel scanner-warning-panel"
      aria-label={`${warnings.length} scanner warning${warnings.length === 1 ? "" : "s"}`}
    >
      <div className="scanner-warning-heading">
        <span
          className="scanner-warning-icon"
          aria-hidden="true"
        >
          ⚠
        </span>
        <h2>Scanner warnings</h2>
        <span className="scanner-warning-count">
          {warnings.length}
        </span>
      </div>

      <p className="scanner-warning-guidance">
        Review these non-blocking library conditions before preparing or
        publishing affected releases.
      </p>

      <ul className="scanner-warning-list">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}
