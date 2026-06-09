import { useState } from "react";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastContext";
import { useVmAutomation, useVms } from "../services/VmAutomationContext";
import { aapResources, aapConfig } from "../config";
import { canTerminateAws, type VM } from "../types/vm";

export function InventoryPage() {
  const service = useVmAutomation();
  const toast = useToast();
  const vms = useVms();
  const [syncing, setSyncing] = useState(false);

  const manual = vms.filter((v) => v.source === "manual");
  const aws = vms.filter((v) => v.source === "aws");
  const tagged = aws.filter(canTerminateAws).length;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await service.syncAwsInventory();
      toast.push({ tone: "info", title: "AWS inventory sync launched." });
    } catch (err) {
      toast.push({
        tone: "danger",
        title: "Could not launch sync.",
        body: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  };

  const aapBase = aapConfig.authorizeUrl.replace(/\/o\/authorize\/?$/, "");

  return (
    <>
      <div className="pageHeader">
        <h1>Inventory</h1>
        <p>AWS dynamic inventory backing the portal catalog.</p>
      </div>

      <div className="statsRow" style={{ marginBottom: 20 }}>
        <div className="statCard">
          <div className="statCard__value">{manual.length}</div>
          <div className="statCard__label">Portal-managed</div>
        </div>
        <div className="statCard">
          <div className="statCard__value">{aws.length}</div>
          <div className="statCard__label">AWS-discovered</div>
        </div>
        <div className="statCard">
          <div className="statCard__value statCard__value--success">{tagged}</div>
          <div className="statCard__label">ManagedBy=ansible</div>
        </div>
      </div>

      <div className="grid">
        <Card
          title="AWS dynamic inventory"
          subtitle="amazon.aws.aws_ec2 plugin"
          icon={<span style={{ fontSize: 16 }}>☁︎</span>}
          actions={
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => void handleSync()}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          }
        >
          <dl className="metaGrid">
            <div>
              <dt>Inventory id</dt>
              <dd>{aapResources.awsInventoryId}</dd>
            </div>
            <div>
              <dt>Source id</dt>
              <dd>{aapResources.awsInventorySourceId}</dd>
            </div>
            <div>
              <dt>Hosts now</dt>
              <dd>{aws.length}</dd>
            </div>
            <div>
              <dt>Open in AAP</dt>
              <dd>
                <a
                  className="linkBtn"
                  href={`${aapBase}/#/inventories/inventory/${aapResources.awsInventoryId}/hosts`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inventory hosts →
                </a>
              </dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Portal-managed inventory"
          subtitle="Create/Delete VM workflows mutate this"
          icon={<span style={{ fontSize: 16 }}>▤</span>}
        >
          <dl className="metaGrid">
            <div>
              <dt>Inventory id</dt>
              <dd>{aapResources.inventoryId}</dd>
            </div>
            <div>
              <dt>Hosts now</dt>
              <dd>{manual.length}</dd>
            </div>
            <div>
              <dt>Provision workflow</dt>
              <dd>WFT {aapResources.provisionEc2TemplateId}</dd>
            </div>
            <div>
              <dt>Delete workflow</dt>
              <dd>WFT {aapResources.deleteVmTemplateId}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        <Card title="Hosts (all sources)" subtitle="Same data as the catalog table, condensed">
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {vms.length === 0 && (
                  <tr><td colSpan={5} className="emptyState">No hosts yet.</td></tr>
                )}
                {vms.map((vm) => (
                  <Row key={vm.id} vm={vm} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ vm }: { vm: VM }) {
  return (
    <tr>
      <td className="table__name">{vm.name}</td>
      <td>
        <span className={"pill " + (vm.source === "aws" ? "pill--aws" : "pill--aap")}>
          {vm.source === "aws" ? "AWS" : "AAP"}
        </span>
      </td>
      <td><StatusBadge status={vm.status} /></td>
      <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{vm.ip}</td>
      <td className="table__sub">{vm.subtitle ?? vm.os}</td>
    </tr>
  );
}
