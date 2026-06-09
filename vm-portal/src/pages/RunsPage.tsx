import { PaginatedRunsList } from "../components/PaginatedRunsList";
import { useRuns } from "../services/VmAutomationContext";

export function RunsPage() {
  const runs = useRuns();
  const ok = runs.filter((r) => r.status === "Successful").length;
  const failed = runs.filter((r) => r.status === "Failed").length;
  const running = runs.filter((r) => r.status === "Running").length;

  return (
    <>
      <div className="pageHeader">
        <h1>Automation Runs</h1>
        <p>Workflow and job template history pulled live from AAP.</p>
      </div>
      <div className="statsRow" style={{ marginBottom: 20 }}>
        <div className="statCard">
          <div className="statCard__value">{runs.length}</div>
          <div className="statCard__label">Recent runs</div>
        </div>
        <div className="statCard">
          <div className="statCard__value statCard__value--success">{ok}</div>
          <div className="statCard__label">Successful</div>
        </div>
        <div className="statCard">
          <div className="statCard__value statCard__value--warning">{running}</div>
          <div className="statCard__label">Running</div>
        </div>
        <div className="statCard">
          <div className="statCard__value statCard__value--danger">{failed}</div>
          <div className="statCard__label">Failed</div>
        </div>
      </div>
      <PaginatedRunsList />
    </>
  );
}
