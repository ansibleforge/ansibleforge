export type Environment = "Development" | "Test" | "Production";

export type OsImage =
  | "RHEL 9"
  | "RHEL 8"
  | "Windows Server 2022"
  | "Fedora";

export type VmStatus =
  | "Running"
  | "Stopped"
  | "Provisioning"
  | "Deleting"
  | "Starting"
  | "Stopping"
  | "Failed";

/** Where a VM record originates — drives both display and what actions apply. */
export type VmSource = "manual" | "aws";

export interface VM {
  id: string;
  name: string;
  environment: Environment | string;
  os: OsImage | string;
  cpu: number;
  memoryGb: number;
  diskGb: number;
  owner: string;
  ip: string;
  status: VmStatus;
  lastRun: string;
  source: VmSource;
  /** Optional secondary line shown under the name. Falls back to os/cpu/memory when unset. */
  subtitle?: string;
  // ---- AWS-only fields (populated when source === "aws") -----------------
  awsRegion?: string;
  awsInstanceId?: string;
  awsTags?: Record<string, string>;
}

/**
 * True when this row can be terminated by the Terminate EC2 workflow. Requires
 * a real instance-id — the optimistic "Provisioning" row injected right after a
 * launch has none yet, so it isn't terminable until the AWS inventory syncs it.
 */
export function canTerminateAws(vm: VM): boolean {
  return (
    vm.source === "aws" &&
    vm.awsTags?.["ManagedBy"] === "ansible" &&
    !!vm.awsInstanceId
  );
}

/**
 * True when this row is eligible for an in-browser SSH terminal: an AWS-backed,
 * running instance with a known instance-id. The gateway re-checks state,
 * tags, and reachability authoritatively — this is just the UI affordance gate.
 */
export function canSshAws(vm: VM): boolean {
  return vm.source === "aws" && vm.status === "Running" && !!vm.awsInstanceId;
}

export type RunAction = "Create" | "Delete" | "Sync";
export type RunStatus = "Successful" | "Running" | "Failed";

export interface AutomationRun {
  id: string;
  workflow: string;
  template: string;
  action: RunAction;
  status: RunStatus;
  started: string;
  vmName?: string;
  /** AAP job id this run corresponds to (used to drill into job/stdout/events). */
  aapJobId?: number;
  /** Username that triggered the run (in a real install, the AAP user). */
  submittedBy?: string;
}

export interface RunTimelineEvent {
  id: number;
  /** Human-friendly summary derived from the AAP event type. */
  label: string;
  task?: string;
  host?: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

export interface AwsVm {
  id: string;
  name: string;
  instanceType: string;
  region: string;
  state: string;
  ipAddress: string;
  instanceId: string;
}

export interface AwsInventorySnapshot {
  totalCount: number;
  /** ISO-8601 of the last sync attempt, or null if never synced. */
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  hosts: AwsVm[];
}

export interface ListRunsOptions {
  /** 1-based page number. */
  page?: number;
  /** Defaults to 25. */
  pageSize?: number;
}

export interface RunsPage {
  runs: AutomationRun[];
  /** Total number of jobs available — not just the current page. */
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface RunDetails {
  run: AutomationRun;
  jobName: string;
  status: RunStatus;
  /** ISO-8601 or null while still queued. */
  startedAt: string | null;
  finishedAt: string | null;
  submittedBy: string;
  extraVars: Record<string, unknown>;
  stdout: string;
  events: RunTimelineEvent[];
}

/** Request to provision a brand-new EC2 instance via the Provision EC2 workflow. */
export interface ProvisionEc2Request {
  name: string;
  region: string;
  instanceType: string;
  amiId: string;
  /** Optional EC2 key pair; absent → no key pair attached. */
  keyName?: string;
  /** Optional subnet; absent → the region's default VPC subnet. */
  subnetId?: string;
  /** Optional security groups (ids); absent → account default. */
  securityGroupIds?: string[];
  /** Optional root volume size override (GB). */
  volumeSizeGb?: number;
  owner: string;
}

// ---- AWS option data used to populate the provisioning form ---------------

export interface AwsSubnet {
  id: string;
  name: string;
  cidr: string;
  az: string;
  vpcId: string;
}

export interface AwsKeyPair {
  name: string;
  id: string;
}

export interface AwsSecurityGroup {
  id: string;
  name: string;
  description: string;
  vpcId: string;
}

export interface AwsAmi {
  id: string;
  name: string;
  /** Curated family key, e.g. "rhel9", "al2023", "win2022". */
  family: string;
  description: string;
  creationDate: string;
}

/** Everything the Create VM form needs to render its dropdowns for a region. */
export interface Ec2Options {
  regions: string[];
  instanceTypes: string[];
  amis: AwsAmi[];
  keyPairs: AwsKeyPair[];
  subnets: AwsSubnet[];
  securityGroups: AwsSecurityGroup[];
}

/** Static region list offered by the form (single source of truth for real + mock). */
export const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-2",
  "eu-west-1",
  "ap-southeast-2",
] as const;

/** Static instance-type menu (single source of truth for real + mock). */
export const AWS_INSTANCE_TYPES = [
  "t3.micro",
  "t3.small",
  "t3.medium",
  "t3a.large",
  "m6i.large",
  "m6i.xlarge",
  "c6i.xlarge",
] as const;
