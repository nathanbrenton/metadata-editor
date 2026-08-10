export type WorkflowApplicationView =
  | "ingest"
  | "staging"
  | "library"
  | "publish";

export type WorkflowLocationDisplay = {
  id: WorkflowApplicationView;
  label: string;
  purpose: string;
  displayPath: string;
  exists: boolean;
  writeEnabled: boolean;
};

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
  locations = [],
}: {
  activeView: WorkflowApplicationView | null;
  onNavigate: (view: WorkflowApplicationView) => void;
  locations?: readonly WorkflowLocationDisplay[];
}) {
  const locationById = new Map(
    locations.map((location) => [location.id, location]),
  );

  return (
    <div className="workflow-navigation-region">
      <div className="workflow-navigation-scroll">
        <nav
          className="application-tabs workflow-navigation"
          aria-label="Release workflow"
        >
          {workflowNavigationItems.map((item) => {
            const active = activeView === item.id;
            const location = locationById.get(item.id);

            return (
              <button
                key={item.id}
                type="button"
                className={active ? "active" : undefined}
                aria-current={active ? "step" : undefined}
                aria-pressed={active}
                title={
                  location
                    ? `${location.label}: ${location.displayPath}\n${location.purpose}`
                    : undefined
                }
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


    </div>
  );
}
