import { CreateVmCard } from "../components/CreateVmCard";
import { RemoveVmCard } from "../components/RemoveVmCard";
import { ExistingVmsTable } from "../components/ExistingVmsTable";
import { RecentRunsPanel } from "../components/RecentRunsPanel";

export function DashboardPage() {
  return (
    <>
      <div className="pageHeader">
        <h1>VM Self-Service Portal</h1>
        <p>Powered by Ansible Automation Platform</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="grid">
          <CreateVmCard />
          <RemoveVmCard />
        </div>
        <ExistingVmsTable />
        <RecentRunsPanel />
      </div>
    </>
  );
}
