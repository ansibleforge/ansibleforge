import { useState } from "react";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";
import { useVmAutomation, useVms } from "../services/VmAutomationContext";
import { useToast } from "./ToastContext";
import { VmRowMenu } from "./VmRowMenu";
import { TerminalDrawer } from "./TerminalDrawer";
import type { VM } from "../types/vm";

const TERMINAL_STATUSES = new Set(["successful", "failed", "error", "canceled"]);

export function ExistingVmsTable() {
  const service = useVmAutomation();
  const vms = useVms();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [connectVm, setConnectVm] = useState<VM | null>(null);

  const handleSyncAws = async () => {
    setSyncing(true);
    try {
      await service.syncAwsInventory();
      toast.push({
        tone: "info",
        title: "AWS inventory sync launched.",
        body: "Hosts will refresh once the source job finishes.",
      });

      // Poll until the source reaches a terminal status, then the hosts feed
      // updates automatically (service notify on vms-changed).
      const start = Date.now();
      const TIMEOUT_MS = 60_000;
      let last: string | null = null;
      while (Date.now() - start < TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, 2_000));
        try {
          const snap = await service.getAwsInventory();
          if (
            snap.lastSyncStatus &&
            TERMINAL_STATUSES.has(snap.lastSyncStatus) &&
            snap.lastSyncStatus !== last
          ) {
            // Force a re-fetch via the useVms subscription.
            (service as { /* notify is private — call refresh through listVms */
              listVms: () => Promise<VM[]>;
            }).listVms();
            break;
          }
          last = snap.lastSyncStatus;
        } catch {
          // ignore transient errors during polling
        }
      }
    } catch (err) {
      toast.push({
        tone: "danger",
        title: "Could not launch AWS inventory sync.",
        body: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  };

  const refresh = async () => {
    // Service emits events on every state change; the hook re-fetches on its
    // own. This button is just an explicit affordance.
    await service.listVms();
  };

  const manualCount = vms.filter((v) => v.source === "manual").length;
  const awsCount = vms.filter((v) => v.source === "aws").length;

  return (
    <>
    <Card
      title="Existing VMs"
      subtitle={`${manualCount} portal-managed · ${awsCount} from AWS dynamic inventory`}
      icon={<span style={{ fontSize: 18 }}>▤</span>}
      pills={
        <>
          <span className="pill pill--template">Inventory</span>
          <span className="pill pill--neutral">amazon.aws.aws_ec2</span>
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => void handleSyncAws()}
            disabled={syncing}
          >
            {syncing ? "Syncing AWS…" : "Sync AWS"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => void refresh()}
          >
            ↻ Refresh
          </button>
        </>
      }
    >
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th>Environment</th>
              <th>Status</th>
              <th>Owner</th>
              <th>IP Address</th>
              <th>Last Run</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {vms.length === 0 && (
              <tr><td colSpan={8} className="emptyState">No VMs yet.</td></tr>
            )}
            {vms.map((vm) => (
              <tr key={vm.id}>
                <td>
                  <div className="table__name">{vm.name}</div>
                  <div className="table__sub">{renderSubtitle(vm)}</div>
                </td>
                <td>
                  <span className={"pill " + (vm.source === "aws" ? "pill--aws" : "pill--aap")}>
                    {vm.source === "aws" ? "AWS" : "AAP"}
                  </span>
                </td>
                <td>{vm.environment}</td>
                <td><StatusBadge status={vm.status} /></td>
                <td>{vm.owner}</td>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{vm.ip}</td>
                <td className="table__sub">{formatLastRun(vm.lastRun)}</td>
                <td className="table__cellRight">
                  <VmRowMenu vm={vm} onConnect={setConnectVm} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    <TerminalDrawer vm={connectVm} onClose={() => setConnectVm(null)} />
    </>
  );
}

function renderSubtitle(vm: VM): string {
  if (vm.subtitle) return vm.subtitle;
  if (vm.source === "aws") return `${vm.os}`;
  const parts: string[] = [String(vm.os)];
  if (vm.cpu > 0) parts.push(`${vm.cpu} vCPU`);
  if (vm.memoryGb > 0) parts.push(`${vm.memoryGb} GB`);
  return parts.join(" · ");
}

function formatLastRun(value: string): string {
  // Pass through human-friendly strings ("just now", "3 hours ago") and
  // ISO timestamps unchanged-but-shortened.
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime()) && /^\d{4}-/.test(value)) {
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return value;
}
