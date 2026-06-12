import type { RunStatus, VmStatus } from "../types/vm";

type AnyStatus = VmStatus | RunStatus;

const STYLES: Record<AnyStatus, { className: string; label: string }> = {
  Running: { className: "statusBadge--running", label: "Running" },
  Successful: { className: "statusBadge--success", label: "Successful" },
  Stopped: { className: "statusBadge--stopped", label: "Stopped" },
  Failed: { className: "statusBadge--failed", label: "Failed" },
  Provisioning: { className: "statusBadge--warning", label: "Provisioning" },
  Deleting: { className: "statusBadge--warning", label: "Deleting" },
  Starting: { className: "statusBadge--warning", label: "Starting…" },
  Stopping: { className: "statusBadge--warning", label: "Stopping…" },
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  const cfg = STYLES[status];
  return (
    <span className={"statusBadge " + cfg.className}>
      <span className="statusBadge__dot" />
      {cfg.label}
    </span>
  );
}
