import { useCallback, useEffect, useState } from "react";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";
import { useVmAutomation } from "../services/VmAutomationContext";
import { RunDetailsDrawer } from "./RunDetailsDrawer";
import type { RunsPage } from "../types/vm";

const PAGE_SIZES = [10, 25, 50, 100];

export function PaginatedRunsList() {
  const service = useVmAutomation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<RunsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await service.listRunsPaged({ page, pageSize });
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [service, page, pageSize]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- effect kicks off an async fetch; state updates land after the await
  useEffect(() => { void fetchPage(); }, [fetchPage]);

  // Re-pull whenever the service emits a runs-changed event so newly
  // launched runs appear on the current page automatically.
  useEffect(() => {
    const unsubscribe = service.subscribe((event) => {
      if (event === "runs-changed") void fetchPage();
    });
    return unsubscribe;
  }, [service, fetchPage]);

  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <>
      <Card
        title="All Automation Runs"
        subtitle={loading ? "Loading…" : `${totalCount.toLocaleString()} total · showing ${rangeStart}–${rangeEnd}`}
        icon={<span style={{ fontSize: 16 }}>▷</span>}
        actions={
          <>
            <label className="paginationBar__sizeLabel" htmlFor="runs-page-size">Per page</label>
            <select
              id="runs-page-size"
              className="form__select"
              style={{ padding: "6px 8px" }}
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => void fetchPage()}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </>
        }
      >
        {error && (
          <div className="banner banner--warning" style={{ marginBottom: 12 }}>
            <span className="banner__icon" aria-hidden>⚠</span>
            <div>{error}</div>
          </div>
        )}

        <div className="recentRuns">
          <div
            className="runRow"
            style={{
              paddingTop: 0,
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 600,
            }}
          >
            <div>Workflow / Template</div>
            <div>Action</div>
            <div>Status</div>
            <div>Started</div>
          </div>

          {data && data.runs.length === 0 && !loading && (
            <div className="emptyState">No runs match the current page.</div>
          )}

          {(data?.runs ?? []).map((run) => (
            <button
              type="button"
              className={"runRow runRow--clickable" + (openRunId === run.id ? " runRow--active" : "")}
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

        <div className="paginationBar">
          <div className="paginationBar__info">
            Page {page} of {totalPages}
          </div>
          <div className="paginationBar__buttons">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setPage(1)}
              disabled={page <= 1 || loading}
            >« First</button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >‹ Prev</button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >Next ›</button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || loading}
            >Last »</button>
          </div>
        </div>
      </Card>

      <RunDetailsDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />
    </>
  );
}
