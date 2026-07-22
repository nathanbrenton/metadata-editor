export type WorkflowApplicationView =
  | "ingest"
  | "staging"
  | "library"
  | "publish";

export const workflowNavigationItems: ReadonlyArray<{
  id: WorkflowApplicationView;
  step: number;
  label: string;
  description: string;
}> = [
  {
    id: "ingest",
    step: 1,
    label: "Ingest",
    description: "Find and inspect source assets",
  },
  {
    id: "staging",
    step: 2,
    label: "Staging",
    description: "Build or update a release workspace",
  },
  {
    id: "library",
    step: 3,
    label: "Library",
    description: "Author metadata and prepare media",
  },
  {
    id: "publish",
    step: 4,
    label: "Publish",
    description: "Preflight and deploy releases",
  },
];

export function WorkflowNavigation({
  activeView,
  onNavigate,
}: {
  activeView: WorkflowApplicationView | null;
  onNavigate: (view: WorkflowApplicationView) => void;
}) {
  return (
    <div className="workflow-navigation-scroll">
      <nav
        className="application-tabs workflow-navigation"
        aria-label="Release workflow"
      >
        {workflowNavigationItems.map((item) => {
          const active = activeView === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={active ? "active" : undefined}
              aria-current={active ? "step" : undefined}
              aria-pressed={active}
              onClick={() => onNavigate(item.id)}
            >
              <span className="workflow-navigation-step">
                {item.step}
              </span>
              <span className="workflow-navigation-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
