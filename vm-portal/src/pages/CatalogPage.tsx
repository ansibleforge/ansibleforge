import { ExistingVmsTable } from "../components/ExistingVmsTable";
import { useVms } from "../services/VmAutomationContext";

export function CatalogPage() {
  const vms = useVms();
  const running = vms.filter((v) => v.status === "Running").length;
  const stopped = vms.filter((v) => v.status === "Stopped").length;
  const provisioning = vms.filter((v) => v.status === "Provisioning" || v.status === "Deleting").length;

  return (
    <>
      <div className="pageHeader">
        <h1>VM Catalog</h1>
        <p>Browse and act on managed virtual machines.</p>
      </div>
      <div className="statsRow" style={{ marginBottom: 20 }}>
        <Stat label="Total" value={vms.length} />
        <Stat label="Running" value={running} accent="success" />
        <Stat label="Stopped" value={stopped} />
        <Stat label="In-flight" value={provisioning} accent="warning" />
      </div>
      <ExistingVmsTable />
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "success" | "warning" }) {
  return (
    <div className="statCard">
      <div className={"statCard__value" + (accent ? ` statCard__value--${accent}` : "")}>{value}</div>
      <div className="statCard__label">{label}</div>
    </div>
  );
}
