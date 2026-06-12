import { useEffect, useState } from "react";
import { useVmAutomation } from "../services/VmAutomationContext";
import { StatusBadge } from "./StatusBadge";
import type { RunDetails } from "../types/vm";

interface Props {
  runId: string | null;
  onClose: () => void;
}

export function RunDetailsDrawer({ runId, onClose }: Props) {
  const service = useVmAutomation();
  const [details, setDetails] = useState<RunDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = runId !== null;

  useEffect(() => {
    if (!runId) {
      // Reset drawer state when closed so stale details don't flash on reopen.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetails(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    service
      .getRunDetails(runId)
      .then((d) => {
        if (alive) setDetails(d);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load run details");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [runId, service]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={"drawerBackdrop" + (open ? " drawerBackdrop--open" : "")}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={"drawer" + (open ? " drawer--open" : "")}
        role="dialog"
        aria-label="Run details"
        aria-hidden={!open}
      >
        <div className="drawer__header">
          <div className="drawer__titleBlock">
            <div className="drawer__title">{details?.jobName ?? "Run details"}</div>
            {details && <StatusBadge status={details.status} />}
          </div>
          <button type="button" className="iconButton" onClick={onClose} aria-label="Close drawer">×</button>
        </div>

        <div className="drawer__body">
          {loading && <div className="drawer__loading">Loading run details…</div>}
          {error && <div className="drawer__error">{error}</div>}
          {details && !loading && <DetailsBody details={details} />}
        </div>
      </aside>
    </>
  );
}

function DetailsBody({ details }: { details: RunDetails }) {
  return (
    <>
      <DetailsMeta details={details} />
      <ExtraVarsSection extraVars={details.extraVars} />
      <TimelineSection details={details} />
      <StdoutSection stdout={details.stdout} />
    </>
  );
}

function DetailsMeta({ details }: { details: RunDetails }) {
  const items: Array<[string, string]> = [
    ["Workflow", details.run.workflow],
    ["Template", details.run.template],
    ["Action", details.run.action],
    ["Started", formatTimestamp(details.startedAt)],
    ["Finished", formatTimestamp(details.finishedAt)],
    ["Submitted by", details.submittedBy],
    ["AAP job id", details.run.aapJobId !== undefined ? String(details.run.aapJobId) : "—"],
  ];
  return (
    <section className="drawer__section">
      <h3 className="drawer__sectionTitle">Run</h3>
      <dl className="metaGrid">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ExtraVarsSection({ extraVars }: { extraVars: Record<string, unknown> }) {
  const empty = Object.keys(extraVars).length === 0;
  return (
    <section className="drawer__section">
      <h3 className="drawer__sectionTitle">Extra vars</h3>
      <pre className="codeBlock">
        {empty ? "{}" : JSON.stringify(extraVars, null, 2)}
      </pre>
    </section>
  );
}

function TimelineSection({ details }: { details: RunDetails }) {
  if (details.events.length === 0) {
    return (
      <section className="drawer__section">
        <h3 className="drawer__sectionTitle">Timeline</h3>
        <div className="emptyState" style={{ padding: "12px 0" }}>No events yet.</div>
      </section>
    );
  }
  return (
    <section className="drawer__section">
      <h3 className="drawer__sectionTitle">Timeline</h3>
      <ol className="timeline">
        {details.events.map((event) => (
          <li key={event.id} className="timeline__item">
            <span className="timeline__dot" aria-hidden />
            <div className="timeline__body">
              <div className="timeline__label">{event.label}</div>
              <div className="timeline__meta">
                <span>{formatTimestamp(event.timestamp)}</span>
                {event.host && <span> · {event.host}</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StdoutSection({ stdout }: { stdout: string }) {
  return (
    <section className="drawer__section">
      <h3 className="drawer__sectionTitle">Stdout</h3>
      <pre className="codeBlock codeBlock--terminal">
        {stdout.trim() || "(no output yet)"}
      </pre>
    </section>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
