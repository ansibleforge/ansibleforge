import { useState } from "react";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";
import { useRuns } from "../services/VmAutomationContext";
import { RunDetailsDrawer } from "./RunDetailsDrawer";
import { useRouter } from "../router";
import { ROUTES } from "../pages";

export function RecentRunsPanel({ hideViewAll = false }: { hideViewAll?: boolean }) {
  const runs = useRuns();
  const router = useRouter();
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  return (
    <>
      <Card
        title="Recent Automation Runs"
        subtitle="Last triggered workflows and jobs"
        icon={<span style={{ fontSize: 16 }}>▷</span>}
        actions={
          hideViewAll ? undefined : (
            <button
              type="button"
              className="linkBtn"
              onClick={() => router.navigate(ROUTES.runs)}
            >
              View all runs →
            </button>
          )
        }
      >
        <div className="recentRuns">
          <div className="runRow" style={{ paddingTop: 0, borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            <div>Workflow / Template</div>
            <div>Action</div>
            <div>Status</div>
            <div>Started</div>
          </div>
          {runs.length === 0 && <div className="emptyState">No runs yet.</div>}
          {runs.map((run) => (
            <button
              type="button"
              className={
                "runRow runRow--clickable" +
                (openRunId === run.id ? " runRow--active" : "")
              }
              key={run.id}
              onClick={() => setOpenRunId(run.id)}
              aria-haspopup="dialog"
              aria-expanded={openRunId === run.id}
            >
              <div className="runRow__workflow">
                <div className="runRow__workflowName">{run.workflow}</div>
                <div className="runRow__workflowTemplate">{run.template}</div>
              </div>
              <div className="runRow__action">{run.action}</div>
              <div><StatusBadge status={run.status} /></div>
              <div className="runRow__started">{run.started}</div>
            </button>
          ))}
        </div>
      </Card>

      <RunDetailsDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />
    </>
  );
}
