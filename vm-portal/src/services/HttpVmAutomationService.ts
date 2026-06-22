import type { AapClient } from "./aap";
import type { VmAutomationService, ServiceEvent } from "./VmAutomationService";
import { AWS_INSTANCE_TYPES, AWS_REGIONS } from "../types/vm";
import type {
  AutomationRun,
  AwsInventorySnapshot,
  AwsVm,
  Ec2Options,
  Environment,
  ListRunsOptions,
  ProvisionEc2Request,
  RunDetails,
  RunStatus,
  RunsPage,
  VM,
  VmStatus,
} from "../types/vm";

/**
 * Restrict the Runs/activity views to this portal's own jobs. AAP's /jobs/ list
 * is instance-wide, so on a shared controller it would otherwise show every
 * template's runs. All vm-portal job templates are named "VM Portal - …", so we
 * filter by that name prefix. Override the prefix via VITE_AAP_RUNS_NAME_PREFIX
 * if your templates use a different naming convention.
 */
const RUNS_NAME_PREFIX = import.meta.env.VITE_AAP_RUNS_NAME_PREFIX ?? "VM Portal";
const RUNS_NAME_FILTER = `&name__startswith=${encodeURIComponent(RUNS_NAME_PREFIX)}`;

/**
 * Resource ids that pin domain operations onto specific AAP objects. These
 * will eventually come from configuration; until the workflow templates
 * exist in AAP, create/delete will surface a meaningful error.
 */
export interface AapResourceConfig {
  /** Inventory whose hosts back the "Existing VMs" table. Demo Inventory = 1. */
  inventoryId: number;
  /** Workflow Job Template launched by `provisionEc2` (-1 = not configured yet). */
  provisionEc2TemplateId: number;
  /** Job Template returning per-region AWS options for the create form (-1 = not configured). */
  describeOptionsTemplateId: number;
  /** Workflow Job Template launched by `deleteVm` (-1 = not configured yet). */
  deleteVmTemplateId: number;
  /** Inventory source `update` endpoint (-1 = not configured yet). */
  inventorySyncSourceId: number;
  /** AWS-backed dynamic inventory. */
  awsInventoryId: number;
  /** Inventory source backing the AWS inventory (amazon.aws.aws_ec2). */
  awsInventorySourceId: number;
  /** Workflow Template that terminates an AWS instance (-1 = not configured). */
  terminateEc2TemplateId: number;
  /** Toggle DisableApiTermination (-1 = not configured). */
  terminationProtectionTemplateId: number;
  /** Add / remove ManagedBy=ansible tag (-1 = not configured). */
  managedByTagTemplateId: number;
  /** Start / stop an AWS instance (-1 = not configured). */
  instanceStateTemplateId: number;
}

/**
 * AAP-backed implementation of the domain service. All HTTP is done through
 * the injected {@link AapClient}; this class only translates between AAP
 * REST DTOs and the domain types the React components consume.
 */
export class HttpVmAutomationService implements VmAutomationService {
  private client: AapClient;
  private config: AapResourceConfig;
  private fetchImpl: typeof fetch;
  private listeners = new Set<(event: ServiceEvent) => void>();
  /**
   * vmId → { status, setAt } overlay used to render an in-flight power
   * change ("Starting…" / "Stopping…") before the AAP cache catches up.
   * Cleared when (a) the underlying status matches the desired end state,
   * or (b) the override is older than OVERLAY_TTL_MS.
   */
  private optimistic = new Map<string, { status: VmStatus; setAt: number }>();
  private readonly OVERLAY_TTL_MS = 3 * 60_000;
  /**
   * Name-tag → in-flight provision, used to render a synthetic "Provisioning"
   * row until the AWS dynamic inventory syncs the real instance in. Keyed on
   * the Name tag because the instance-id isn't known client-side yet. Dropped
   * once a real AWS host with that Name appears, or after the TTL.
   */
  private pendingProvisions = new Map<
    string,
    { region: string; owner: string; instanceType: string; jobId: number; setAt: number }
  >();
  private readonly PROVISION_OVERLAY_TTL_MS = 5 * 60_000;
  /** Per-region cache of EC2 options + de-dupe of concurrent lookups. */
  private ec2OptionsCache = new Map<string, { value: Ec2Options; at: number }>();
  private inflightOptions = new Map<string, Promise<Ec2Options>>();
  private readonly EC2_OPTIONS_TTL_MS = 5 * 60_000;

  constructor(client: AapClient, config: AapResourceConfig, fetchImpl: typeof fetch = fetch) {
    this.client = client;
    this.config = config;
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  // ---- Read paths ------------------------------------------------------

  async listVms(): Promise<VM[]> {
    // Manual (Demo Inventory) hosts + AWS dynamic inventory hosts, merged.
    const manualReq = this.get<HostsResponse>(
      `/api/controller/v2/inventories/${this.config.inventoryId}/hosts/?page_size=200`,
    );
    const awsReq =
      this.config.awsInventoryId >= 0
        ? this.get<HostsResponse>(
            `/api/controller/v2/inventories/${this.config.awsInventoryId}/hosts/?page_size=200`,
          ).catch(() => null)
        : Promise.resolve(null);
    const [manual, aws] = await Promise.all([manualReq, awsReq]);
    const merged: VM[] = [...manual.results.map(hostToVm), ...(aws?.results ?? []).map(hostToAwsBackedVm)];
    return this.applyPendingProvisions(merged.map((vm) => this.applyOverlay(vm)));
  }

  /**
   * Prepend synthetic "Provisioning" rows for instances we just launched but
   * the AWS inventory hasn't surfaced yet. Correlated by Name tag; expired by
   * TTL or once the real host shows up.
   */
  private applyPendingProvisions(vms: VM[]): VM[] {
    if (this.pendingProvisions.size === 0) return vms;
    const now = Date.now();
    const present = new Set(
      vms.filter((v) => v.source === "aws").map((v) => v.awsTags?.["Name"] ?? v.name),
    );
    const synthetic: VM[] = [];
    for (const [name, p] of this.pendingProvisions) {
      if (now - p.setAt > this.PROVISION_OVERLAY_TTL_MS || present.has(name)) {
        this.pendingProvisions.delete(name);
        continue;
      }
      synthetic.push({
        id: `pending-${p.jobId}`,
        name,
        environment: p.region,
        os: p.instanceType,
        cpu: 0,
        memoryGb: 0,
        diskGb: 0,
        owner: p.owner,
        ip: "(pending)",
        status: "Provisioning",
        lastRun: "just now",
        source: "aws",
        awsRegion: p.region,
        awsTags: { ManagedBy: "ansible", Name: name, Owner: p.owner },
        subtitle: `${p.instanceType} · ${p.region} · provisioning`,
      });
    }
    return [...synthetic, ...vms];
  }

  private applyOverlay(vm: VM): VM {
    const override = this.optimistic.get(vm.id);
    if (!override) return vm;
    // Expire overlays older than the TTL.
    if (Date.now() - override.setAt > this.OVERLAY_TTL_MS) {
      this.optimistic.delete(vm.id);
      return vm;
    }
    // Clear the overlay once the AAP cache catches up to the settled state.
    if (
      (override.status === "Stopping" && vm.status === "Stopped") ||
      (override.status === "Starting" && vm.status === "Running") ||
      vm.status === "Failed"
    ) {
      this.optimistic.delete(vm.id);
      return vm;
    }
    return { ...vm, status: override.status };
  }

  private setOverlay(vmId: string, status: VmStatus) {
    this.optimistic.set(vmId, { status, setAt: Date.now() });
    this.notify("vms-changed");
  }

  async listRuns(): Promise<AutomationRun[]> {
    // Scope to this portal's own jobs. On a shared AAP the unfiltered jobs list
    // surfaces every template's runs (CaC, SCCM, EE builds, …); all vm-portal
    // job templates are named "VM Portal - …", so filter by that name prefix.
    const data = await this.get<JobsResponse>(
      `/api/controller/v2/jobs/?order_by=-created&page_size=25${RUNS_NAME_FILTER}`,
    );
    return data.results.map(jobToRun);
  }

  async listRunsPaged(opts: ListRunsOptions = {}): Promise<RunsPage> {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(opts.pageSize ?? 25)));
    const data = await this.get<JobsResponse>(
      `/api/controller/v2/jobs/?order_by=-created&page=${page}&page_size=${pageSize}${RUNS_NAME_FILTER}`,
    );
    return {
      runs: data.results.map(jobToRun),
      totalCount: data.count,
      page,
      pageSize,
    };
  }

  async getRunDetails(runId: string): Promise<RunDetails> {
    // runId is `aap-${jobId}` for runs loaded from listRuns; for runs launched
    // through this client we use the same format.
    const jobId = runIdToJobId(runId);
    const [job, stdout, events] = await Promise.all([
      this.client.getJob(jobId),
      this.client.getJobStdout(jobId),
      this.client.getJobEvents(jobId),
    ]);

    const run: AutomationRun = {
      id: runId,
      workflow: job.name,
      template: friendlyTemplateName(job.workflowTemplateId),
      action: actionFor(job.workflowTemplateId),
      status: aapToRunStatus(job.status),
      started: job.started ?? job.finished ?? "—",
      vmName: typeof job.extraVars["vm_name"] === "string"
        ? (job.extraVars["vm_name"] as string)
        : undefined,
      aapJobId: job.id,
      submittedBy: "—",
    };

    return {
      run,
      jobName: job.name,
      status: aapToRunStatus(job.status),
      startedAt: job.started,
      finishedAt: job.finished,
      submittedBy: run.submittedBy ?? "—",
      extraVars: job.extraVars,
      stdout,
      events: events.map((e) => ({
        id: e.id,
        label: describeAapEvent(e.eventType, e.task),
        task: e.task,
        host: e.host,
        timestamp: e.created,
      })),
    };
  }

  // ---- Write paths -----------------------------------------------------

  async getEc2Options(region: string, opts: { signal?: AbortSignal } = {}): Promise<Ec2Options> {
    const cached = this.ec2OptionsCache.get(region);
    if (cached && Date.now() - cached.at < this.EC2_OPTIONS_TTL_MS) return cached.value;
    const inflight = this.inflightOptions.get(region);
    if (inflight) return inflight;
    if (this.config.describeOptionsTemplateId < 0) {
      throw new Error("AWS describe-options job template is not configured in AAP yet.");
    }
    const p = (async () => {
      const job = await this.client.launchJobTemplateAndWait(
        this.config.describeOptionsTemplateId,
        { extra_vars: { region } },
        { signal: opts.signal },
      );
      const value = mapEc2Options(job.artifacts["ec2_options"]);
      this.ec2OptionsCache.set(region, { value, at: Date.now() });
      return value;
    })().finally(() => this.inflightOptions.delete(region));
    this.inflightOptions.set(region, p);
    return p;
  }

  async provisionEc2(request: ProvisionEc2Request): Promise<{ run: AutomationRun; vm: VM }> {
    if (this.config.provisionEc2TemplateId < 0) {
      throw new Error("Provision EC2 workflow template is not configured in AAP yet.");
    }
    const launch = await this.client.launchWorkflowTemplate(this.config.provisionEc2TemplateId, {
      extra_vars: {
        vm_name: request.name,
        region: request.region,
        instance_type: request.instanceType,
        image_id: request.amiId,
        ...(request.keyName ? { key_name: request.keyName } : {}),
        ...(request.subnetId ? { subnet_id: request.subnetId } : {}),
        ...(request.securityGroupIds?.length ? { security_group_ids: request.securityGroupIds } : {}),
        ...(request.volumeSizeGb ? { volume_size_gb: request.volumeSizeGb } : {}),
        owner: request.owner,
      },
    });

    const run: AutomationRun = {
      id: `aap-${launch.jobId}`,
      workflow: "Provision EC2 Workflow",
      template: "provision-ec2",
      action: "Create",
      status: "Running",
      started: "just now",
      vmName: request.name,
      aapJobId: launch.jobId,
      submittedBy: "—",
    };

    // Optimistic AWS row, tagged exactly as the playbook will tag it so the
    // start/stop/terminate buttons are correctly enabled immediately. A
    // pending-provision overlay keeps it visible until the AWS inventory syncs.
    const vm: VM = {
      id: `pending-${launch.jobId}`,
      name: request.name,
      environment: request.region,
      os: request.instanceType,
      cpu: 0,
      memoryGb: 0,
      diskGb: 0,
      owner: request.owner,
      ip: "(pending)",
      status: "Provisioning",
      lastRun: "just now",
      source: "aws",
      awsRegion: request.region,
      awsTags: { ManagedBy: "ansible", Name: request.name, Owner: request.owner },
      subtitle: `${request.instanceType} · ${request.region} · provisioning`,
    };
    this.pendingProvisions.set(request.name, {
      region: request.region,
      owner: request.owner,
      instanceType: request.instanceType,
      jobId: launch.jobId,
      setAt: Date.now(),
    });

    this.notify("vms-changed");
    this.notify("runs-changed");
    return { run, vm };
  }

  async deleteVm(vmId: string): Promise<{ run: AutomationRun }> {
    const vms = await this.listVms();
    const target = vms.find((v) => v.id === vmId);
    if (!target) throw new Error(`Unknown VM: ${vmId}`);

    if (target.source === "manual") {
      if (this.config.deleteVmTemplateId < 0) {
        throw new Error("Delete VM workflow template is not configured in AAP yet.");
      }
      const launch = await this.client.launchWorkflowTemplate(this.config.deleteVmTemplateId, {
        extra_vars: { vm_name: target.name },
      });
      const run: AutomationRun = {
        id: `aap-${launch.jobId}`,
        workflow: "Delete VM Workflow",
        template: "delete-vm",
        action: "Delete",
        status: "Running",
        started: "just now",
        aapJobId: launch.jobId,
        submittedBy: "—",
      };
      this.notify("runs-changed");
      return { run };
    }

    // AWS path: tag-gated termination via the Terminate EC2 workflow.
    if (this.config.terminateEc2TemplateId < 0) {
      throw new Error("Terminate EC2 workflow template is not configured in AAP yet.");
    }
    if (target.awsTags?.["ManagedBy"] !== "ansible") {
      throw new Error(
        "Refusing to terminate: this AWS instance is not tagged ManagedBy=ansible.",
      );
    }
    if (!target.awsInstanceId) {
      throw new Error(
        "This instance is still provisioning — wait until it appears in the AWS inventory before terminating.",
      );
    }
    const launch = await this.client.launchWorkflowTemplate(this.config.terminateEc2TemplateId, {
      extra_vars: {
        instance_id: target.awsInstanceId,
        region: target.awsRegion ?? "us-east-2",
        vm_name: target.name,
      },
    });
    const run: AutomationRun = {
      id: `aap-${launch.jobId}`,
      workflow: "Terminate EC2 Workflow",
      template: "terminate-ec2",
      action: "Delete",
      status: "Running",
      started: "just now",
      vmName: target.name,
      aapJobId: launch.jobId,
      submittedBy: "—",
    };
    this.notify("runs-changed");
    return { run };
  }

  async getAwsInventory(): Promise<AwsInventorySnapshot> {
    if (this.config.awsInventoryId < 0) {
      throw new Error("AWS inventory is not configured.");
    }
    // Pull the source metadata + the hosts in parallel.
    const [source, hosts] = await Promise.all([
      this.config.awsInventorySourceId >= 0
        ? this.get<{ status: string | null; last_updated: string | null }>(
            `/api/controller/v2/inventory_sources/${this.config.awsInventorySourceId}/`,
          )
        : Promise.resolve(null),
      this.get<HostsResponse>(
        `/api/controller/v2/inventories/${this.config.awsInventoryId}/hosts/?page_size=200`,
      ),
    ]);
    return {
      totalCount: hosts.count,
      lastSyncedAt: source?.last_updated ?? null,
      lastSyncStatus: source?.status ?? null,
      hosts: hosts.results.map(awsHostToVm),
    };
  }

  async syncAwsInventory(): Promise<{ run: AutomationRun }> {
    if (this.config.awsInventorySourceId < 0) {
      throw new Error("AWS inventory source is not configured.");
    }
    const headers = await this.authHeaders();
    const res = await this.fetchImpl(
      `/api/controller/v2/inventory_sources/${this.config.awsInventorySourceId}/update/`,
      { method: "POST", headers: { ...headers, "Content-Type": "application/json" } },
    );
    if (!res.ok) throw new Error(`AWS inventory sync failed: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { id: number };
    const run: AutomationRun = {
      id: `aap-${data.id}`,
      workflow: "AWS Inventory Sync",
      template: "aws-ec2-source",
      action: "Sync",
      status: "Running",
      started: "just now",
      aapJobId: data.id,
      submittedBy: "—",
    };
    this.notify("runs-changed");
    return { run };
  }

  async setTerminationProtection(vmId: string, enabled: boolean): Promise<{ run: AutomationRun }> {
    if (this.config.terminationProtectionTemplateId < 0) {
      throw new Error("Termination-protection workflow is not configured.");
    }
    const target = await this.requireAwsVm(vmId);
    const launch = await this.client.launchWorkflowTemplate(
      this.config.terminationProtectionTemplateId,
      {
        extra_vars: {
          instance_id: target.awsInstanceId,
          region: target.awsRegion ?? "us-east-2",
          termination_protection: enabled,
          vm_name: target.name,
        },
      },
    );
    const run: AutomationRun = {
      id: `aap-${launch.jobId}`,
      workflow: enabled ? "Enable Termination Protection" : "Disable Termination Protection",
      template: "set-termination-protection",
      action: "Sync",
      status: "Running",
      started: "just now",
      vmName: target.name,
      aapJobId: launch.jobId,
      submittedBy: "—",
    };
    this.notify("runs-changed");
    return { run };
  }

  async setManagedByTag(vmId: string, present: boolean): Promise<{ run: AutomationRun }> {
    if (this.config.managedByTagTemplateId < 0) {
      throw new Error("ManagedBy tag workflow is not configured.");
    }
    const target = await this.requireAwsVm(vmId);
    const launch = await this.client.launchWorkflowTemplate(
      this.config.managedByTagTemplateId,
      {
        extra_vars: {
          instance_id: target.awsInstanceId,
          region: target.awsRegion ?? "us-east-2",
          tag_present: present,
          vm_name: target.name,
        },
      },
    );
    const run: AutomationRun = {
      id: `aap-${launch.jobId}`,
      workflow: present ? "Apply ManagedBy=ansible Tag" : "Remove ManagedBy=ansible Tag",
      template: "set-managed-by-tag",
      action: "Sync",
      status: "Running",
      started: "just now",
      vmName: target.name,
      aapJobId: launch.jobId,
      submittedBy: "—",
    };
    this.notify("runs-changed");
    return { run };
  }

  async setInstanceState(vmId: string, desired: "running" | "stopped"): Promise<{ run: AutomationRun }> {
    if (this.config.instanceStateTemplateId < 0) {
      throw new Error("Instance-state workflow is not configured.");
    }
    const target = await this.requireAwsVm(vmId);
    if (target.awsTags?.["ManagedBy"] !== "ansible") {
      throw new Error(
        "Refusing to change power state: this AWS instance is not tagged ManagedBy=ansible.",
      );
    }
    // Optimistic overlay so the row flips to Starting…/Stopping… immediately,
    // before AAP's cache catches up.
    this.setOverlay(vmId, desired === "running" ? "Starting" : "Stopping");
    const launch = await this.client.launchWorkflowTemplate(
      this.config.instanceStateTemplateId,
      {
        extra_vars: {
          instance_id: target.awsInstanceId,
          region: target.awsRegion ?? "us-east-2",
          desired_state: desired,
          vm_name: target.name,
        },
      },
    );
    const run: AutomationRun = {
      id: `aap-${launch.jobId}`,
      workflow: desired === "running" ? "Start EC2 Instance" : "Stop EC2 Instance",
      template: "set-instance-state",
      action: "Sync",
      status: "Running",
      started: "just now",
      vmName: target.name,
      aapJobId: launch.jobId,
      submittedBy: "—",
    };
    this.notify("runs-changed");
    return { run };
  }

  private async requireAwsVm(vmId: string): Promise<VM> {
    const vms = await this.listVms();
    const target = vms.find((v) => v.id === vmId);
    if (!target) throw new Error(`Unknown VM: ${vmId}`);
    if (target.source !== "aws") {
      throw new Error("This action is only available on AWS-sourced rows.");
    }
    if (!target.awsInstanceId) {
      throw new Error("Missing AWS instance id on this row.");
    }
    return target;
  }

  async syncInventory(): Promise<{ run: AutomationRun }> {
    if (this.config.inventorySyncSourceId < 0) {
      throw new Error("Inventory sync source is not configured in AAP yet.");
    }
    // Triggering an inventory source update is its own endpoint:
    //   POST /api/controller/v2/inventory_sources/{id}/update/
    // It returns a Job that we can poll the same way as a workflow launch.
    const auth = await this.authHeaders();
    const res = await this.fetchImpl(
      `/api/controller/v2/inventory_sources/${this.config.inventorySyncSourceId}/update/`,
      { method: "POST", headers: { ...auth, "Content-Type": "application/json" } },
    );
    if (!res.ok) throw new Error(`Inventory sync failed: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { id: number };
    const run: AutomationRun = {
      id: `aap-${data.id}`,
      workflow: "VM Inventory Sync",
      template: "inventory-sync",
      action: "Sync",
      status: "Running",
      started: "just now",
      aapJobId: data.id,
      submittedBy: "—",
    };
    this.notify("runs-changed");
    return { run };
  }

  // ---- Event plumbing --------------------------------------------------

  subscribe(listener: (event: ServiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: ServiceEvent) {
    for (const l of this.listeners) l(event);
  }

  // ---- HTTP helpers ----------------------------------------------------

  private async authHeaders(): Promise<Record<string, string>> {
    const { tokenStore } = await import("../auth/tokenStore");
    const auth = tokenStore.get();
    if (!auth) throw new Error("Not authenticated");
    return { Authorization: `${auth.tokenType} ${auth.accessToken}`, Accept: "application/json" };
  }

  private async get<T>(path: string): Promise<T> {
    const headers = await this.authHeaders();
    const res = await this.fetchImpl(path, { headers });
    if (!res.ok) throw new Error(`AAP request failed: ${res.status} ${res.statusText} (${path})`);
    return (await res.json()) as T;
  }
}

// ---- DTO translation ---------------------------------------------------

interface HostsResponse {
  count: number;
  results: AapHost[];
}

interface AapHost {
  id: number;
  name: string;
  variables: string;
  enabled: boolean;
  modified: string;
  inventory: number;
  summary_fields?: {
    last_job?: { status?: string; finished?: string };
  };
}

interface JobsResponse {
  count: number;
  results: AapJobSummary[];
}

interface AapJobSummary {
  id: number;
  name: string;
  status: string;
  created: string;
  started: string | null;
  finished: string | null;
  unified_job_template?: number;
  job_template?: number;
  extra_vars?: string;
}

function awsHostToVm(host: AapHost): AwsVm {
  const vars = parseHostVars(host.variables);
  const str = (k: string): string =>
    typeof vars[k] === "string" ? (vars[k] as string) : "";
  return {
    id: `aws-host-${host.id}`,
    name: host.name,
    instanceType: str("instance_type"),
    region: str("ec2_region") || str("placement.region"),
    state: str("ec2_state") || str("instance_state_name"),
    ipAddress: str("ansible_host") || str("public_ip_address") || str("private_ip_address"),
    instanceId: str("ec2_id") || str("instance_id"),
  };
}

/** Raw shape emitted by aws-describe-options.yml via set_stats (snake_case). */
interface RawEc2Options {
  subnets?: Array<{ id: string; name?: string; cidr: string; az: string; vpc_id: string }>;
  key_pairs?: Array<{ name: string; id: string }>;
  security_groups?: Array<{ id: string; name: string; description?: string; vpc_id: string }>;
  amis?: Array<{ id: string; name: string; family: string; description?: string; creation_date?: string }>;
}

/** Translate the describe-options artifacts blob into domain Ec2Options. */
function mapEc2Options(raw: unknown): Ec2Options {
  const r = (raw ?? {}) as RawEc2Options;
  return {
    regions: [...AWS_REGIONS],
    instanceTypes: [...AWS_INSTANCE_TYPES],
    amis: (r.amis ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      family: a.family,
      description: a.description ?? "",
      creationDate: a.creation_date ?? "",
    })),
    keyPairs: (r.key_pairs ?? []).map((k) => ({ name: k.name, id: k.id })),
    subnets: (r.subnets ?? []).map((s) => ({
      id: s.id,
      name: s.name ?? "",
      cidr: s.cidr,
      az: s.az,
      vpcId: s.vpc_id,
    })),
    securityGroups: (r.security_groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description ?? "",
      vpcId: g.vpc_id,
    })),
  };
}

function hostToAwsBackedVm(host: AapHost): VM {
  const vars = parseHostVars(host.variables);
  const str = (k: string): string =>
    typeof vars[k] === "string" ? (vars[k] as string) : "";
  // The amazon.aws.aws_ec2 plugin stores the live state as a nested object:
  //   state: { code: 16, name: "running" }
  // We also compose `ec2_state` via the inventory source; either may be present.
  const nestedState =
    (vars.state as Record<string, unknown> | undefined)?.name;
  const nestedRegion =
    (vars.placement as Record<string, unknown> | undefined)?.region;
  const instanceType = str("instance_type");
  const region =
    str("ec2_region") ||
    (typeof nestedRegion === "string" ? nestedRegion : "");
  const state = (
    str("ec2_state") ||
    str("instance_state_name") ||
    (typeof nestedState === "string" ? nestedState : "")
  ).toLowerCase();
  const ip = str("ansible_host") || str("public_ip_address") || str("private_ip_address");
  // The aws_ec2 plugin keys hosts by instance-id (always unique). The
  // friendly tag:Name is published as display_name via the source's compose.
  const displayName = str("display_name") || host.name;
  const instanceId = str("ec2_id") || str("instance_id") || host.name;
  const status: VM["status"] = state === "running"
    ? "Running"
    : state === "stopped" || state === "stopping"
    ? "Stopped"
    : state === "pending" || state === "starting"
    ? "Provisioning"
    : state === "shutting-down" || state === "terminated"
    ? "Deleting"
    : "Stopped";
  const rawTags = vars["tags"];
  const tags: Record<string, string> =
    typeof rawTags === "object" && rawTags !== null
      ? Object.fromEntries(
          Object.entries(rawTags as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string]),
        )
      : {};
  return {
    id: `aws-host-${host.id}`,
    name: displayName,
    environment: region || "AWS",
    os: instanceType || "EC2 instance",
    cpu: 0,
    memoryGb: 0,
    diskGb: 0,
    owner: tags["Owner"] ?? (typeof vars["owner"] === "string" ? (vars["owner"] as string) : "AWS"),
    ip: ip || "—",
    status,
    lastRun: host.modified,
    source: "aws",
    // instance id always shown so two rows with the same display_name stay
    // distinguishable at a glance.
    subtitle: [instanceType, region, instanceId].filter(Boolean).join(" · ") || "AWS EC2",
    awsRegion: region,
    awsInstanceId: instanceId,
    awsTags: tags,
  };
}

function hostToVm(host: AapHost): VM {
  // Host vars in AAP are stored as YAML/JSON in the `variables` field. The
  // create-vm workflow encodes the portal-domain fields here so we can read
  // them back. Be forgiving — anything missing falls back to a sensible default.
  const vars = parseHostVars(host.variables);
  const toNum = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
    return 0;
  };
  return {
    id: `aap-host-${host.id}`,
    name: host.name,
    environment: (vars.environment as Environment) ?? "Development",
    os: typeof vars.os_image === "string" ? (vars.os_image as VM["os"]) : "RHEL 9",
    cpu: toNum(vars.cpu),
    memoryGb: toNum(vars.memory_gb),
    diskGb: toNum(vars.disk_gb),
    owner: typeof vars.owner === "string" ? vars.owner : "—",
    ip:
      typeof vars.ansible_host === "string"
        ? vars.ansible_host
        : typeof vars.ip === "string"
        ? vars.ip
        : "—",
    status: host.enabled ? "Running" : "Stopped",
    lastRun: host.modified,
    source: "manual",
  };
}

function parseHostVars(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function jobToRun(job: AapJobSummary): AutomationRun {
  return {
    id: `aap-${job.id}`,
    workflow: job.name,
    template: friendlyTemplateName(job.unified_job_template ?? job.job_template ?? -1),
    action: actionFor(job.unified_job_template ?? job.job_template ?? -1),
    status: aapToRunStatus(job.status),
    started: job.started ?? job.created,
    aapJobId: job.id,
  };
}

function friendlyTemplateName(_id: number): string {
  // Once we know the actual template ids we can map them, but for now use a
  // generic label that's still useful.
  return "controller-job";
}

function actionFor(_id: number): AutomationRun["action"] {
  return "Sync";
}

function aapToRunStatus(status: string): RunStatus {
  switch (status) {
    case "successful": return "Successful";
    case "failed":
    case "error":
    case "canceled": return "Failed";
    default: return "Running";
  }
}

function describeAapEvent(eventType: string, task: string | undefined): string {
  switch (eventType) {
    case "playbook_on_start": return "Playbook started";
    case "playbook_on_task_start": return task ? `Task: ${task}` : "Task started";
    case "runner_on_ok": return "Task succeeded";
    case "runner_on_failed": return "Task failed";
    case "playbook_on_stats": return "Playbook completed";
    default: return eventType;
  }
}

function runIdToJobId(runId: string): number {
  const m = runId.match(/^aap-(\d+)$/);
  if (!m) throw new Error(`Cannot resolve AAP job id from runId=${runId}`);
  return Number(m[1]);
}

