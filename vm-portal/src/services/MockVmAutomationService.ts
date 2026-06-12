import type { AapClient, AapJob, AapJobEvent, AapJobStatus, SeededJob } from "./aap";
import { MockAapClient } from "./aap";
import type {
  ServiceEvent,
  VmAutomationService,
} from "./VmAutomationService";
import { AWS_INSTANCE_TYPES, AWS_REGIONS } from "../types/vm";
import type {
  AutomationRun,
  AwsInventorySnapshot,
  AwsVm,
  Ec2Options,
  ListRunsOptions,
  ProvisionEc2Request,
  RunDetails,
  RunStatus,
  RunTimelineEvent,
  RunsPage,
  VM,
} from "../types/vm";

/**
 * Workflow template IDs as they would exist in a real AAP install.
 */
export const TEMPLATE_IDS = {
  createVm: 42,
  deleteVm: 43,
  syncInventory: 7,
  provisionEc2: 44,
  describeOptions: 45,
} as const;

const seedVms: VM[] = [
  { id: "vm-001", name: "web-01-prod", environment: "Production", os: "RHEL 9", cpu: 4, memoryGb: 16, diskGb: 100, owner: "jdoe",   ip: "10.10.20.15", status: "Running", lastRun: "2 hours ago", source: "manual" },
  { id: "vm-002", name: "api-02-prod", environment: "Production", os: "RHEL 9", cpu: 8, memoryGb: 32, diskGb: 200, owner: "asmith", ip: "10.10.20.27", status: "Running", lastRun: "3 hours ago", source: "manual" },
  { id: "vm-003", name: "db-01-prod",  environment: "Production", os: "RHEL 9", cpu: 8, memoryGb: 64, diskGb: 500, owner: "rpatel", ip: "10.10.20.31", status: "Running", lastRun: "1 day ago",  source: "manual" },
  { id: "vm-004", name: "web-01-dev",  environment: "Development", os: "Fedora", cpu: 2, memoryGb: 8,  diskGb: 50, owner: "mlee",   ip: "10.20.30.15", status: "Stopped", lastRun: "5 days ago", source: "manual" },
  { id: "vm-005", name: "test-01-dev", environment: "Development", os: "RHEL 8", cpu: 2, memoryGb: 8,  diskGb: 50, owner: "mlee",   ip: "10.20.30.22", status: "Stopped", lastRun: "1 week ago", source: "manual" },
];

const seedAwsVms: VM[] = [
  { id: "aws-host-101", name: "iis-demo",           environment: "us-east-2", os: "t3.medium",  cpu: 0, memoryGb: 0, diskGb: 0, owner: "AWS", ip: "10.0.101.76",  status: "Running", lastRun: "synced 11 min ago", source: "aws", subtitle: "t3.medium · us-east-2 · i-0bfb17e1bb27fcbf1",  awsRegion: "us-east-2", awsInstanceId: "i-0bfb17e1bb27fcbf1", awsTags: { ManagedBy: "ansible", Name: "iis-demo" } },
  { id: "aws-host-102", name: "mcp-demo",           environment: "us-east-2", os: "t3a.large",  cpu: 0, memoryGb: 0, diskGb: 0, owner: "AWS", ip: "3.148.247.20", status: "Running", lastRun: "synced 11 min ago", source: "aws", subtitle: "t3a.large · us-east-2 · i-021ba79c23be1935e",  awsRegion: "us-east-2", awsInstanceId: "i-021ba79c23be1935e", awsTags: { ManagedBy: "ansible", Name: "mcp-demo" } },
  { id: "aws-host-103", name: "ocp-r7s88-master-0", environment: "us-east-2", os: "m6i.xlarge", cpu: 0, memoryGb: 0, diskGb: 0, owner: "AWS", ip: "10.0.14.187",  status: "Running", lastRun: "synced 11 min ago", source: "aws", subtitle: "m6i.xlarge · us-east-2 · i-0c98c2ebdb670e068", awsRegion: "us-east-2", awsInstanceId: "i-0c98c2ebdb670e068", awsTags: { Name: "ocp-r7s88-master-0" } },
];

/**
 * Build seed runs + matching pre-populated AAP jobs so getRunDetails can
 * return realistic data without hitting the network. Each entry pairs a
 * domain AutomationRun with a SeededJob (AAP DTO) keyed by aapJobId.
 */
function buildSeed(): { runs: AutomationRun[]; jobs: SeededJob[] } {
  const now = Date.now();
  const minutes = (m: number) => new Date(now - m * 60_000).toISOString();
  const hours = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const days = (d: number) => new Date(now - d * 86_400_000).toISOString();

  const runs: AutomationRun[] = [
    { id: "run-101", aapJobId: 101, workflow: "Create VM Workflow", template: "create-vm", action: "Create", status: "Successful", started: "3 hours ago",   vmName: "api-02-prod",     submittedBy: "asmith" },
    { id: "run-102", aapJobId: 102, workflow: "Delete VM Workflow", template: "delete-vm", action: "Delete", status: "Running",    started: "12 minutes ago", vmName: "stage-04-test",   submittedBy: "mlee" },
    { id: "run-103", aapJobId: 103, workflow: "Create VM Workflow", template: "create-vm", action: "Create", status: "Failed",     started: "1 day ago",     vmName: "build-runner-09", submittedBy: "jdoe" },
    { id: "run-104", aapJobId: 104, workflow: "Create VM Workflow", template: "create-vm", action: "Create", status: "Successful", started: "2 days ago",    vmName: "db-01-prod",      submittedBy: "rpatel" },
    { id: "run-105", aapJobId: 105, workflow: "Delete VM Workflow", template: "delete-vm", action: "Delete", status: "Successful", started: "3 days ago",    vmName: "legacy-02",       submittedBy: "asmith" },
  ];

  const jobs: SeededJob[] = [
    seededJob({
      id: 101,
      template: TEMPLATE_IDS.createVm,
      name: "Create VM Workflow",
      status: "successful",
      startedAt: hours(3),
      finishedAt: new Date(now - 3 * 3_600_000 + 110_000).toISOString(),
      extraVars: { vm_name: "api-02-prod", environment: "Production", os_image: "RHEL 9", cpu: 8, memory_gb: 32, disk_gb: 200, owner: "asmith" },
    }),
    seededJob({
      id: 102,
      template: TEMPLATE_IDS.deleteVm,
      name: "Delete VM Workflow",
      status: "running",
      startedAt: minutes(12),
      finishedAt: null,
      extraVars: { vm_id: "vm-stage-04", vm_name: "stage-04-test" },
    }),
    seededJob({
      id: 103,
      template: TEMPLATE_IDS.createVm,
      name: "Create VM Workflow",
      status: "failed",
      startedAt: days(1),
      finishedAt: new Date(now - 86_400_000 + 38_000).toISOString(),
      extraVars: { vm_name: "build-runner-09", environment: "Development", os_image: "Fedora", cpu: 4, memory_gb: 16, disk_gb: 100, owner: "jdoe" },
      failureReason: "Image template build-runner-base not found in inventory.",
    }),
    seededJob({
      id: 104,
      template: TEMPLATE_IDS.createVm,
      name: "Create VM Workflow",
      status: "successful",
      startedAt: days(2),
      finishedAt: new Date(now - 2 * 86_400_000 + 140_000).toISOString(),
      extraVars: { vm_name: "db-01-prod", environment: "Production", os_image: "RHEL 9", cpu: 8, memory_gb: 64, disk_gb: 500, owner: "rpatel" },
    }),
    seededJob({
      id: 105,
      template: TEMPLATE_IDS.deleteVm,
      name: "Delete VM Workflow",
      status: "successful",
      startedAt: days(3),
      finishedAt: new Date(now - 3 * 86_400_000 + 65_000).toISOString(),
      extraVars: { vm_id: "vm-legacy-02", vm_name: "legacy-02" },
    }),
  ];

  return { runs, jobs };
}

interface SeededJobSpec {
  id: number;
  template: number;
  name: string;
  status: AapJobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  extraVars: Record<string, unknown>;
  failureReason?: string;
}

function seededJob(spec: SeededJobSpec): SeededJob {
  const events: AapJobEvent[] = [];
  const stdoutLines: string[] = [];
  let nextEventId = spec.id * 10;

  const push = (eventType: string, ts: string, task?: string, host?: string, stdoutLine?: string) => {
    events.push({ id: nextEventId++, jobId: spec.id, eventType, task, host, created: ts });
    if (stdoutLine) stdoutLines.push(stdoutLine);
  };

  const start = spec.startedAt ?? new Date().toISOString();
  push("playbook_on_start", start, undefined, undefined, `PLAY [${spec.name}] ${"*".repeat(40)}`);

  const offsets = [1500, 3500, 6000, 9000];
  const tasks = spec.template === TEMPLATE_IDS.createVm
    ? ["Gather facts", "Reserve IP from IPAM", "Launch VM in hypervisor", "Wait for cloud-init", "Register host with inventory"]
    : spec.template === TEMPLATE_IDS.deleteVm
    ? ["Gather facts", "Drain workloads", "Power off VM", "Release IP back to IPAM", "Remove from inventory"]
    : ["Refresh hypervisor inventory", "Reconcile records"];

  const startMs = Date.parse(start);
  const ok = spec.status === "successful";
  const failed = spec.status === "failed";
  const running = spec.status === "running";

  // Walk the task list, but stop early if the run failed/is still running.
  const fullPasses = ok ? tasks.length : failed ? Math.max(1, tasks.length - 2) : Math.min(2, tasks.length);

  for (let i = 0; i < fullPasses; i++) {
    const taskStartMs = startMs + (offsets[i] ?? offsets[offsets.length - 1] + i * 1200);
    const taskStartIso = new Date(taskStartMs).toISOString();
    const okIso = new Date(taskStartMs + 800).toISOString();
    const lastInLoop = i === fullPasses - 1;
    const treatAsFailed = failed && lastInLoop;

    push("playbook_on_task_start", taskStartIso, tasks[i], undefined, `TASK [${tasks[i]}] ${"*".repeat(40)}`);
    if (treatAsFailed) {
      push("runner_on_failed", okIso, tasks[i], "aap-execution-01", `fatal: [aap-execution-01]: FAILED! => {"msg": "${spec.failureReason ?? "Unknown error"}"}`);
    } else if (!running || i < fullPasses - 1) {
      push("runner_on_ok", okIso, tasks[i], "aap-execution-01", `ok: [aap-execution-01]`);
    }
  }

  if (spec.finishedAt) {
    push("playbook_on_stats", spec.finishedAt, undefined, undefined,
      `PLAY RECAP ${"*".repeat(60)}\naap-execution-01           : ok=${ok ? fullPasses : Math.max(0, fullPasses - 1)}    changed=${ok ? Math.max(1, fullPasses - 1) : 0}    unreachable=0    failed=${failed ? 1 : 0}`,
    );
  }

  return {
    id: spec.id,
    name: spec.name,
    status: spec.status,
    workflowTemplateId: spec.template,
    started: spec.startedAt,
    finished: spec.finishedAt,
    failed,
    extraVars: spec.extraVars,
    stdout: stdoutLines.join("\n") + "\n",
    events,
  };
}

export class MockVmAutomationService implements VmAutomationService {
  private vms: VM[];
  private runs: AutomationRun[];
  private listeners = new Set<(event: ServiceEvent) => void>();
  private idCounter = 1000;
  private client: AapClient;

  constructor(client: AapClient, init?: { seedVms?: VM[]; seedRuns?: AutomationRun[] }) {
    this.client = client;
    this.vms = [...(init?.seedVms ?? seedVms)];
    this.runs = [...(init?.seedRuns ?? [])];
  }

  /** Default factory used by VmAutomationProvider when no service is supplied. */
  static createDefault(): VmAutomationService {
    const seed = buildSeed();
    const client = new MockAapClient({ seedJobs: seed.jobs });
    return new MockVmAutomationService(client, { seedRuns: seed.runs });
  }

  async listVms(): Promise<VM[]> {
    // Merge manual VMs with the mock AWS dynamic-inventory hosts.
    return [...this.vms, ...seedAwsVms];
  }
  async listRuns(): Promise<AutomationRun[]> {
    return [...this.runs];
  }

  async listRunsPaged(opts: ListRunsOptions = {}): Promise<RunsPage> {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(opts.pageSize ?? 25)));
    const start = (page - 1) * pageSize;
    return {
      runs: this.runs.slice(start, start + pageSize),
      totalCount: this.runs.length,
      page,
      pageSize,
    };
  }

  async getEc2Options(region: string): Promise<Ec2Options> {
    // Simulate AAP job launch + EE spin-up latency so the loading UX is exercised.
    await wait(1200);
    return {
      regions: [...AWS_REGIONS],
      instanceTypes: [...AWS_INSTANCE_TYPES],
      amis: [
        { id: "ami-0rhel9demo", name: "RHEL-9.4_HVM-20260501-x86_64", family: "rhel9", description: "Red Hat Enterprise Linux 9", creationDate: "2026-05-01T00:00:00Z" },
        { id: "ami-0al2023demo", name: "al2023-ami-2023.5-x86_64", family: "al2023", description: "Amazon Linux 2023", creationDate: "2026-05-10T00:00:00Z" },
        { id: "ami-0win2022demo", name: "Windows_Server-2022-English-Full-Base", family: "win2022", description: "Windows Server 2022", creationDate: "2026-04-20T00:00:00Z" },
      ],
      keyPairs: [
        { name: "vm-portal-demo", id: "key-0abc" },
        { name: "ops-shared", id: "key-0def" },
      ],
      subnets: [
        { id: "subnet-0aaa", name: "public-a", cidr: "10.0.1.0/24", az: `${region}a`, vpcId: "vpc-0demo" },
        { id: "subnet-0bbb", name: "private-b", cidr: "10.0.2.0/24", az: `${region}b`, vpcId: "vpc-0demo" },
      ],
      securityGroups: [
        { id: "sg-0web", name: "web-tier", description: "HTTP/HTTPS in", vpcId: "vpc-0demo" },
        { id: "sg-0ssh", name: "ssh-bastion", description: "SSH from bastion", vpcId: "vpc-0demo" },
      ],
    };
  }

  async provisionEc2(request: ProvisionEc2Request): Promise<{ run: AutomationRun; vm: VM }> {
    const launch = await this.client.launchWorkflowTemplate(TEMPLATE_IDS.provisionEc2, {
      extra_vars: {
        vm_name: request.name,
        region: request.region,
        instance_type: request.instanceType,
        image_id: request.amiId,
        owner: request.owner,
      },
    });

    const instanceId = `i-0${Math.floor(Math.random() * 0xfffffffff).toString(16).padStart(9, "0")}`;
    const vm: VM = {
      id: this.makeId("aws-host"),
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
      awsInstanceId: instanceId,
      awsTags: { ManagedBy: "ansible", Name: request.name, Owner: request.owner },
      subtitle: `${request.instanceType} · ${request.region} · ${instanceId}`,
    };
    const run: AutomationRun = {
      id: this.makeId("run"),
      workflow: "Provision EC2 Workflow",
      template: "provision-ec2",
      action: "Create",
      status: "Running",
      started: "just now",
      vmName: request.name,
      aapJobId: launch.jobId,
      submittedBy: "admin",
    };

    this.vms = [vm, ...this.vms];
    this.runs = [run, ...this.runs];
    this.notify("vms-changed");
    this.notify("runs-changed");

    this.followJob(launch.jobId, (terminal) => {
      const success = terminal.status === "successful";
      this.updateVm(vm.id, (current) => ({
        ...current,
        status: success ? "Running" : "Failed",
        ip: success ? randomPublicIp() : current.ip,
        lastRun: "just now",
      }));
      this.updateRun(run.id, (current) => ({ ...current, status: success ? "Successful" : "Failed" }));
    });

    return { run, vm };
  }

  async deleteVm(vmId: string): Promise<{ run: AutomationRun }> {
    // Same dispatch rule as the real service so mock-mode UX matches prod.
    const awsTarget = seedAwsVms.find((v) => v.id === vmId);
    if (awsTarget) {
      if (awsTarget.awsTags?.["ManagedBy"] !== "ansible") {
        throw new Error(
          "Refusing to terminate: this AWS instance is not tagged ManagedBy=ansible.",
        );
      }
      const launch = await this.client.launchWorkflowTemplate(TEMPLATE_IDS.deleteVm, {
        extra_vars: { instance_id: awsTarget.awsInstanceId, region: awsTarget.awsRegion },
      });
      const run: AutomationRun = {
        id: this.makeId("run"),
        workflow: "Terminate EC2 Workflow",
        template: "terminate-ec2",
        action: "Delete",
        status: "Running",
        started: "just now",
        vmName: awsTarget.name,
        aapJobId: launch.jobId,
        submittedBy: "admin",
      };
      this.runs = [run, ...this.runs];
      this.notify("runs-changed");
      this.followJob(launch.jobId, (terminal) => {
        this.updateRun(run.id, (current) => ({
          ...current,
          status: terminal.status === "successful" ? "Successful" : "Failed",
        }));
      });
      return { run };
    }

    const vm = this.vms.find((v) => v.id === vmId);
    if (!vm) throw new Error(`Unknown VM: ${vmId}`);

    const launch = await this.client.launchWorkflowTemplate(TEMPLATE_IDS.deleteVm, {
      extra_vars: { vm_id: vm.id, vm_name: vm.name },
    });

    const run: AutomationRun = {
      id: this.makeId("run"),
      workflow: "Delete VM Workflow",
      template: "delete-vm",
      action: "Delete",
      status: "Running",
      started: "just now",
      vmName: vm.name,
      aapJobId: launch.jobId,
      submittedBy: "admin",
    };

    this.updateVm(vm.id, (current) => ({ ...current, status: "Deleting", lastRun: "just now" }));
    this.runs = [run, ...this.runs];
    this.notify("runs-changed");

    this.followJob(launch.jobId, (terminal) => {
      const success = terminal.status === "successful";
      if (success) {
        this.vms = this.vms.filter((v) => v.id !== vm.id);
        this.notify("vms-changed");
      } else {
        this.updateVm(vm.id, (current) => ({ ...current, status: "Failed" }));
      }
      this.updateRun(run.id, (current) => ({ ...current, status: success ? "Successful" : "Failed" }));
    });

    return { run };
  }

  private mockAwsHosts: AwsVm[] = [
    { id: "aws-host-101", name: "iis-demo",          instanceType: "t3.medium",  region: "us-east-2", state: "running", ipAddress: "10.0.101.76",  instanceId: "i-0bfb17e1bb27fcbf1" },
    { id: "aws-host-102", name: "mcp-demo",          instanceType: "t3a.large",  region: "us-east-2", state: "running", ipAddress: "3.148.247.20", instanceId: "i-09fdb456014b5f6b2" },
    { id: "aws-host-103", name: "ocp-r7s88-master-0",instanceType: "m6i.xlarge", region: "us-east-2", state: "running", ipAddress: "10.0.14.187",  instanceId: "i-0deadbeef00112233" },
  ];
  private mockAwsLastSynced: string = new Date(Date.now() - 11 * 60_000).toISOString();
  private mockAwsLastStatus: string = "successful";

  async getAwsInventory(): Promise<AwsInventorySnapshot> {
    return {
      totalCount: this.mockAwsHosts.length,
      lastSyncedAt: this.mockAwsLastSynced,
      lastSyncStatus: this.mockAwsLastStatus,
      hosts: [...this.mockAwsHosts],
    };
  }

  async syncAwsInventory(): Promise<{ run: AutomationRun }> {
    const launch = await this.client.launchWorkflowTemplate(TEMPLATE_IDS.syncInventory, {
      // Mock: pretend it was a sync against the AWS source.
      extra_vars: { source: "aws-ec2" },
    });
    const run: AutomationRun = {
      id: this.makeId("run"),
      workflow: "AWS Inventory Sync",
      template: "aws-ec2-source",
      action: "Sync",
      status: "Running",
      started: "just now",
      aapJobId: launch.jobId,
      submittedBy: "admin",
    };
    this.runs = [run, ...this.runs];
    this.notify("runs-changed");
    this.followJob(launch.jobId, (terminal) => {
      const success = terminal.status === "successful";
      this.mockAwsLastSynced = new Date().toISOString();
      this.mockAwsLastStatus = success ? "successful" : "failed";
      this.updateRun(run.id, (current) => ({
        ...current,
        status: success ? "Successful" : "Failed",
      }));
    });
    return { run };
  }

  async setTerminationProtection(vmId: string, enabled: boolean): Promise<{ run: AutomationRun }> {
    const target = seedAwsVms.find((v) => v.id === vmId);
    if (!target) throw new Error(`Unknown AWS VM: ${vmId}`);
    const launch = await this.client.launchWorkflowTemplate(TEMPLATE_IDS.syncInventory, {
      extra_vars: { instance_id: target.awsInstanceId, region: target.awsRegion, termination_protection: enabled },
    });
    const run: AutomationRun = {
      id: this.makeId("run"),
      workflow: enabled ? "Enable Termination Protection" : "Disable Termination Protection",
      template: "set-termination-protection",
      action: "Sync",
      status: "Running",
      started: "just now",
      vmName: target.name,
      aapJobId: launch.jobId,
      submittedBy: "admin",
    };
    this.runs = [run, ...this.runs];
    this.notify("runs-changed");
    this.followJob(launch.jobId, (terminal) => {
      this.updateRun(run.id, (current) => ({
        ...current,
        status: terminal.status === "successful" ? "Successful" : "Failed",
      }));
    });
    return { run };
  }

  async setManagedByTag(vmId: string, present: boolean): Promise<{ run: AutomationRun }> {
    const target = seedAwsVms.find((v) => v.id === vmId);
    if (!target) throw new Error(`Unknown AWS VM: ${vmId}`);
    const launch = await this.client.launchWorkflowTemplate(TEMPLATE_IDS.syncInventory, {
      extra_vars: { instance_id: target.awsInstanceId, region: target.awsRegion, tag_present: present },
    });
    const run: AutomationRun = {
      id: this.makeId("run"),
      workflow: present ? "Apply ManagedBy=ansible Tag" : "Remove ManagedBy=ansible Tag",
      template: "set-managed-by-tag",
      action: "Sync",
      status: "Running",
      started: "just now",
      vmName: target.name,
      aapJobId: launch.jobId,
      submittedBy: "admin",
    };
    this.runs = [run, ...this.runs];
    this.notify("runs-changed");
    // Update the seed copy so the UI reflects the new tag state on next render.
    if (present) {
      target.awsTags = { ...target.awsTags, ManagedBy: "ansible" };
    } else if (target.awsTags) {
      const next = { ...target.awsTags };
      delete next["ManagedBy"];
      target.awsTags = next;
    }
    this.notify("vms-changed");
    this.followJob(launch.jobId, (terminal) => {
      this.updateRun(run.id, (current) => ({
        ...current,
        status: terminal.status === "successful" ? "Successful" : "Failed",
      }));
    });
    return { run };
  }

  async setInstanceState(vmId: string, desired: "running" | "stopped"): Promise<{ run: AutomationRun }> {
    const target = seedAwsVms.find((v) => v.id === vmId);
    if (!target) throw new Error(`Unknown AWS VM: ${vmId}`);
    if (target.awsTags?.["ManagedBy"] !== "ansible") {
      throw new Error(
        "Refusing to change power state: this AWS instance is not tagged ManagedBy=ansible.",
      );
    }
    const launch = await this.client.launchWorkflowTemplate(TEMPLATE_IDS.syncInventory, {
      extra_vars: { instance_id: target.awsInstanceId, region: target.awsRegion, desired_state: desired },
    });
    const run: AutomationRun = {
      id: this.makeId("run"),
      workflow: desired === "running" ? "Start EC2 Instance" : "Stop EC2 Instance",
      template: "set-instance-state",
      action: "Sync",
      status: "Running",
      started: "just now",
      vmName: target.name,
      aapJobId: launch.jobId,
      submittedBy: "admin",
    };
    this.runs = [run, ...this.runs];
    this.notify("runs-changed");
    // Reflect the in-flight state locally so the row flips immediately.
    target.status = desired === "running" ? "Starting" : "Stopping";
    this.notify("vms-changed");
    this.followJob(launch.jobId, (terminal) => {
      const ok = terminal.status === "successful";
      // Settle the row to its final power state on success; revert on failure.
      target.status = ok
        ? (desired === "running" ? "Running" : "Stopped")
        : "Failed";
      this.notify("vms-changed");
      this.updateRun(run.id, (current) => ({
        ...current,
        status: ok ? "Successful" : "Failed",
      }));
    });
    return { run };
  }

  async syncInventory(): Promise<{ run: AutomationRun }> {
    const launch = await this.client.launchWorkflowTemplate(TEMPLATE_IDS.syncInventory, {});

    const run: AutomationRun = {
      id: this.makeId("run"),
      workflow: "VM Inventory Sync",
      template: "inventory-sync",
      action: "Sync",
      status: "Running",
      started: "just now",
      aapJobId: launch.jobId,
      submittedBy: "admin",
    };
    this.runs = [run, ...this.runs];
    this.notify("runs-changed");

    this.followJob(launch.jobId, (terminal) => {
      this.updateRun(run.id, (current) => ({
        ...current,
        status: terminal.status === "successful" ? "Successful" : "Failed",
      }));
    });

    return { run };
  }

  async getRunDetails(runId: string): Promise<RunDetails> {
    const run = this.runs.find((r) => r.id === runId);
    if (!run) throw new Error(`Unknown run: ${runId}`);
    if (run.aapJobId === undefined) {
      // Defensive: every run we produce records its job id; this should be unreachable.
      throw new Error(`Run ${runId} has no AAP job id`);
    }

    const [job, stdout, events] = await Promise.all([
      this.client.getJob(run.aapJobId),
      this.client.getJobStdout(run.aapJobId),
      this.client.getJobEvents(run.aapJobId),
    ]);

    return {
      run,
      jobName: job.name,
      status: mapAapToRunStatus(job.status, run.status),
      startedAt: job.started,
      finishedAt: job.finished,
      submittedBy: run.submittedBy ?? "admin",
      extraVars: job.extraVars,
      stdout,
      events: events.map(describeEvent),
    };
  }

  subscribe(listener: (event: ServiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---- internals -------------------------------------------------------

  private notify(event: ServiceEvent) {
    for (const listener of this.listeners) listener(event);
  }
  private makeId(prefix: string): string {
    return `${prefix}-${(this.idCounter++).toString(36)}`;
  }
  private updateVm(id: string, mutator: (vm: VM) => VM) {
    let changed = false;
    this.vms = this.vms.map((vm) => {
      if (vm.id !== id) return vm;
      changed = true;
      return mutator(vm);
    });
    if (changed) this.notify("vms-changed");
  }
  private updateRun(id: string, mutator: (run: AutomationRun) => AutomationRun) {
    let changed = false;
    this.runs = this.runs.map((run) => {
      if (run.id !== id) return run;
      changed = true;
      return mutator(run);
    });
    if (changed) this.notify("runs-changed");
  }

  private followJob(jobId: number, onTerminal: (job: AapJob) => void) {
    const TICK_MS = 500;
    const tick = async () => {
      try {
        const job = await this.client.getJob(jobId);
        if (isTerminal(job.status)) {
          onTerminal(job);
          return;
        }
      } catch {
        // ignore transient errors during polling; the real client should retry.
      }
      window.setTimeout(tick, TICK_MS);
    };
    window.setTimeout(tick, TICK_MS);
  }
}

function isTerminal(status: AapJobStatus): boolean {
  return status === "successful" || status === "failed" || status === "canceled" || status === "error";
}

function mapAapToRunStatus(aap: AapJobStatus, fallback: RunStatus): RunStatus {
  switch (aap) {
    case "successful": return "Successful";
    case "failed":
    case "error":
    case "canceled": return "Failed";
    case "pending":
    case "waiting":
    case "running": return "Running";
    default: return fallback;
  }
}

function describeEvent(event: AapJobEvent): RunTimelineEvent {
  const label = (() => {
    switch (event.eventType) {
      case "playbook_on_start": return "Playbook started";
      case "playbook_on_task_start": return event.task ? `Task: ${event.task}` : "Task started";
      case "runner_on_ok": return event.host ? `Succeeded on ${event.host}` : "Task succeeded";
      case "runner_on_failed": return event.host ? `Failed on ${event.host}` : "Task failed";
      case "playbook_on_stats": return "Playbook completed";
      case "playbook_on_no_hosts_matched": return "No hosts matched";
      default: return event.eventType;
    }
  })();
  return {
    id: event.id,
    label,
    task: event.task,
    host: event.host,
    timestamp: event.created,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A plausible public IPv4 for a freshly-provisioned EC2 instance. */
function randomPublicIp(): string {
  const oct = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));
  return `${oct(3, 54)}.${oct(0, 255)}.${oct(0, 255)}.${oct(1, 254)}`;
}
