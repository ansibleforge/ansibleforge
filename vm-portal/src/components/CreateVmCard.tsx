import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "./Card";
import { useVmAutomation } from "../services/VmAutomationContext";
import { useToast } from "./ToastContext";
import { AWS_REGIONS } from "../types/vm";
import type { Ec2Options, ProvisionEc2Request } from "../types/vm";

const DEFAULT_REGION = "us-east-2";

interface FormState {
  name: string;
  owner: string;
  region: string;
  instanceType: string;
  amiId: string;
  keyName: string;
  subnetId: string;
  securityGroupIds: string[];
  volumeSizeGb: string;
}

const initialState: FormState = {
  name: "",
  owner: "",
  region: DEFAULT_REGION,
  instanceType: "",
  amiId: "",
  keyName: "",
  subnetId: "",
  securityGroupIds: [],
  volumeSizeGb: "20",
};

export function CreateVmCard() {
  const service = useVmAutomation();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const [options, setOptions] = useState<Ec2Options | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  /** Guards against out-of-order lookups when the region is changed rapidly. */
  const latestRegion = useRef(form.region);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  // Region-first cascade: (re)load the per-region option set whenever the
  // region changes, clearing the now-stale dependent selections.
  useEffect(() => {
    const region = form.region;
    latestRegion.current = region;
    const controller = new AbortController();
    // Synchronously reset to the loading state and clear stale dependent
    // selections before the async lookup kicks off — intentional here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptionsLoading(true);
    setOptionsError(null);
    setOptions(null);
    setForm((s) => ({ ...s, instanceType: "", amiId: "", keyName: "", subnetId: "", securityGroupIds: [] }));

    service
      .getEc2Options(region, { signal: controller.signal })
      .then((opts) => {
        if (latestRegion.current !== region) return; // a newer region won
        setOptions(opts);
        setForm((s) => ({
          ...s,
          instanceType: opts.instanceTypes[0] ?? "",
          amiId: opts.amis[0]?.id ?? "",
        }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || latestRegion.current !== region) return;
        setOptionsError(err instanceof Error ? err.message : "Failed to load AWS options");
      })
      .finally(() => {
        if (latestRegion.current === region) setOptionsLoading(false);
      });

    return () => controller.abort();
  }, [service, form.region]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Instance name is required";
    else if (!/^[a-z0-9-]+$/i.test(form.name)) next.name = "Use letters, numbers, and dashes";
    if (!form.owner.trim()) next.owner = "Owner is required";
    if (!form.instanceType) next.instanceType = "Select an instance type";
    if (!form.amiId) next.amiId = "Select an AMI";
    if (!form.subnetId) next.subnetId = "Select a subnet";
    if (form.volumeSizeGb && Number(form.volumeSizeGb) < 8) next.volumeSizeGb = "Must be at least 8";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const payload: ProvisionEc2Request = {
      name: form.name.trim(),
      region: form.region,
      instanceType: form.instanceType,
      amiId: form.amiId,
      keyName: form.keyName || undefined,
      subnetId: form.subnetId || undefined,
      securityGroupIds: form.securityGroupIds.length ? form.securityGroupIds : undefined,
      volumeSizeGb: form.volumeSizeGb ? Number(form.volumeSizeGb) : undefined,
      owner: form.owner.trim(),
    };
    try {
      const { vm } = await service.provisionEc2(payload);
      toast.push({
        tone: "success",
        title: "Provision EC2 workflow launched.",
        body: `${vm.name} is provisioning in ${payload.region}.`,
      });
      // Keep the region (and its loaded options); clear the rest.
      setForm((s) => ({ ...initialState, region: s.region, instanceType: s.instanceType, amiId: s.amiId }));
      setErrors({});
    } catch (err) {
      toast.push({
        tone: "danger",
        title: "Could not launch Provision EC2 workflow.",
        body: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const dependentsDisabled = optionsLoading || !!optionsError;

  return (
    <Card
      title="Create VM"
      subtitle="Provision a new EC2 instance"
      icon={<span style={{ fontSize: 18 }}>+</span>}
      pills={
        <>
          <span className="pill pill--workflow">Workflow</span>
          <span className="pill pill--template">Provision EC2 Workflow</span>
        </>
      }
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form__row">
          <div className="form__field">
            <label className="form__label" htmlFor="vm-name">Instance Name</label>
            <input
              id="vm-name"
              className={"form__input" + (errors.name ? " form__input--error" : "")}
              placeholder="e.g. web-04-prod"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
            {errors.name && <span className="form__error">{errors.name}</span>}
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="vm-region">Region</label>
            <select
              id="vm-region"
              className="form__select"
              value={form.region}
              onChange={(e) => update("region", e.target.value)}
            >
              {AWS_REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {optionsLoading && (
          <div className="banner banner--info">
            <span className="banner__icon" aria-hidden>⟳</span>
            <div>Querying AWS via AAP for {form.region} — this can take 10–20 seconds…</div>
          </div>
        )}
        {optionsError && (
          <div className="banner banner--warning">
            <span className="banner__icon" aria-hidden>⚠</span>
            <div>
              {optionsError}{" "}
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => update("region", form.region)}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div className="form__row">
          <div className="form__field">
            <label className="form__label" htmlFor="vm-type">Instance Type</label>
            <select
              id="vm-type"
              className={"form__select" + (errors.instanceType ? " form__input--error" : "")}
              value={form.instanceType}
              disabled={dependentsDisabled}
              onChange={(e) => update("instanceType", e.target.value)}
            >
              <option value="">Select…</option>
              {(options?.instanceTypes ?? []).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {errors.instanceType && <span className="form__error">{errors.instanceType}</span>}
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="vm-ami">AMI</label>
            <select
              id="vm-ami"
              className={"form__select" + (errors.amiId ? " form__input--error" : "")}
              value={form.amiId}
              disabled={dependentsDisabled}
              onChange={(e) => update("amiId", e.target.value)}
            >
              <option value="">Select…</option>
              {(options?.amis ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.family} — {a.name}</option>
              ))}
            </select>
            {errors.amiId && <span className="form__error">{errors.amiId}</span>}
          </div>
        </div>

        <div className="form__row">
          <div className="form__field">
            <label className="form__label" htmlFor="vm-key">Key Pair</label>
            <select
              id="vm-key"
              className="form__select"
              value={form.keyName}
              disabled={dependentsDisabled}
              onChange={(e) => update("keyName", e.target.value)}
            >
              <option value="">(none)</option>
              {(options?.keyPairs ?? []).map((k) => (
                <option key={k.id} value={k.name}>{k.name}</option>
              ))}
            </select>
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="vm-subnet">Subnet</label>
            <select
              id="vm-subnet"
              className={"form__select" + (errors.subnetId ? " form__input--error" : "")}
              value={form.subnetId}
              disabled={dependentsDisabled}
              onChange={(e) => update("subnetId", e.target.value)}
            >
              <option value="">Select…</option>
              {(options?.subnets ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.id} — {s.cidr} ({s.az})</option>
              ))}
            </select>
            {errors.subnetId && <span className="form__error">{errors.subnetId}</span>}
          </div>
        </div>

        <div className="form__row">
          <div className="form__field">
            <label className="form__label" htmlFor="vm-sg">Security Groups</label>
            <select
              id="vm-sg"
              className="form__select"
              multiple
              value={form.securityGroupIds}
              disabled={dependentsDisabled}
              onChange={(e) =>
                update(
                  "securityGroupIds",
                  Array.from(e.target.selectedOptions, (o) => o.value),
                )
              }
            >
              {(options?.securityGroups ?? []).map((g) => (
                <option key={g.id} value={g.id}>{g.name} — {g.description || g.id}</option>
              ))}
            </select>
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="vm-vol">Root Volume (GB)</label>
            <input
              id="vm-vol"
              type="number"
              min={8}
              className={"form__input" + (errors.volumeSizeGb ? " form__input--error" : "")}
              value={form.volumeSizeGb}
              onChange={(e) => update("volumeSizeGb", e.target.value)}
            />
            {errors.volumeSizeGb && <span className="form__error">{errors.volumeSizeGb}</span>}
          </div>
        </div>

        <div className="form__field">
          <label className="form__label" htmlFor="vm-owner">Owner</label>
          <input
            id="vm-owner"
            className={"form__input" + (errors.owner ? " form__input--error" : "")}
            placeholder="e.g. jdoe"
            value={form.owner}
            onChange={(e) => update("owner", e.target.value)}
          />
          {errors.owner && <span className="form__error">{errors.owner}</span>}
        </div>

        <div className="banner banner--info">
          <span className="banner__icon" aria-hidden>ⓘ</span>
          <div>Provisions a real EC2 instance tagged <code>ManagedBy=ansible</code> so it can be managed and terminated from this portal.</div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn--primary" disabled={submitting || dependentsDisabled}>
            {submitting ? "Launching…" : "Provision via AAP"}
          </button>
        </div>
      </form>
    </Card>
  );
}
