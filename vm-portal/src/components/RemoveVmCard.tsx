import { useMemo, useState } from "react";
import { Card } from "./Card";
import { useVmAutomation, useVms } from "../services/VmAutomationContext";
import { useToast } from "./ToastContext";
import { canTerminateAws } from "../types/vm";

export function RemoveVmCard() {
  const service = useVmAutomation();
  const toast = useToast();
  const vms = useVms();

  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(
    () => vms.find((v) => v.id === selectedId),
    [vms, selectedId],
  );

  // Manual hosts (Delete VM workflow) + AWS hosts tagged ManagedBy=ansible
  // (Terminate EC2 workflow). Anything mid-deletion is excluded.
  const removable = vms.filter(
    (v) => v.status !== "Deleting" && (v.source === "manual" || canTerminateAws(v)),
  );

  const handleRemove = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await service.deleteVm(selected.id);
      toast.push({
        tone: "warning",
        title: "Delete VM workflow launched.",
        body: `${selected.name} is being decommissioned.`,
      });
      setSelectedId("");
      setConfirmed(false);
    } catch (err) {
      toast.push({
        tone: "danger",
        title: "Could not launch Delete VM workflow.",
        body: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canRemove = Boolean(selected) && confirmed && !submitting;

  return (
    <Card
      title="Remove VM"
      subtitle="Decommission an existing virtual machine"
      icon={<span style={{ fontSize: 16 }}>✕</span>}
      pills={
        <>
          <span className="pill pill--workflow">Workflow</span>
          <span className="pill pill--template">Delete VM Workflow</span>
        </>
      }
    >
      <div className="form">
        <div className="form__field">
          <label className="form__label" htmlFor="vm-select">Select VM</label>
          <select
            id="vm-select"
            className="form__select"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">Choose a VM…</option>
            {removable.map((vm) => (
              <option key={vm.id} value={vm.id}>
                {vm.source === "aws" ? "AWS · " : "AAP · "}
                {vm.name} — {vm.environment} ({vm.ip})
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <div className="detailsBox">
            <div>
              <div className="detailsBox__label">Name</div>
              <div className="detailsBox__value">{selected.name}</div>
            </div>
            <div>
              <div className="detailsBox__label">Environment</div>
              <div className="detailsBox__value">{selected.environment}</div>
            </div>
            <div>
              <div className="detailsBox__label">IP Address</div>
              <div className="detailsBox__value">{selected.ip}</div>
            </div>
            <div>
              <div className="detailsBox__label">Owner</div>
              <div className="detailsBox__value">{selected.owner}</div>
            </div>
          </div>
        )}

        <label className="checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={!selected}
          />
          {selected?.source === "aws"
            ? "I understand this will terminate the real EC2 instance."
            : "I understand this will delete the VM."}
        </label>

        <div className="banner banner--warning">
          <span className="banner__icon" aria-hidden>⚠</span>
          <div>
            {selected?.source === "aws"
              ? <>This action will trigger the <strong>Terminate EC2</strong> workflow. Only instances tagged <code>ManagedBy=ansible</code> are eligible.</>
              : <>This action will trigger the <strong>Delete VM</strong> workflow in AAP.</>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!canRemove}
            onClick={handleRemove}
          >
            {submitting
              ? "Launching…"
              : selected?.source === "aws"
              ? "Terminate via AAP"
              : "Remove via AAP"}
          </button>
        </div>
      </div>
    </Card>
  );
}
