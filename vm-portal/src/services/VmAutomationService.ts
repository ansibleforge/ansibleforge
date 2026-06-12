import type {
  AutomationRun,
  AwsInventorySnapshot,
  Ec2Options,
  ProvisionEc2Request,
  ListRunsOptions,
  RunDetails,
  RunsPage,
  VM,
} from "../types/vm";

/**
 * Event emitted when the service's internal VM or Run state changes. The UI
 * re-fetches via {@link VmAutomationService.listVms} / listRuns on each event.
 */
export type ServiceEvent = "vms-changed" | "runs-changed";

/**
 * Domain-level VM automation. Components depend on this interface — they
 * should never import an AAP client or REST types directly.
 *
 * The service is responsible for:
 *   - Translating a domain action (createVm) into one or more AAP launches.
 *   - Mapping the resulting AAP jobs back into domain entities (VM, AutomationRun).
 *   - Owning the canonical state (VM list, recent runs) and notifying
 *     subscribers when it changes.
 */
export interface VmAutomationService {
  /** Snapshot of the current VM inventory. */
  listVms(): Promise<VM[]>;
  /** Snapshot of recent automation runs, newest first. */
  listRuns(): Promise<AutomationRun[]>;

  /** Paginated runs feed — used by the dedicated Runs page. */
  listRunsPaged(opts?: ListRunsOptions): Promise<RunsPage>;

  /**
   * Per-region AWS options (subnets, key pairs, security groups, curated AMIs)
   * used to populate the provisioning form. Backed by a read-only AAP lookup
   * job; results may be cached per region.
   */
  getEc2Options(region: string, opts?: { signal?: AbortSignal }): Promise<Ec2Options>;

  /** Launch the "Provision EC2" workflow to create a real EC2 instance. Resolves once the run + optimistic VM are recorded; status updates asynchronously. */
  provisionEc2(request: ProvisionEc2Request): Promise<{ run: AutomationRun; vm: VM }>;
  /** Launch the "Delete VM" workflow template for the given VM. */
  deleteVm(vmId: string): Promise<{ run: AutomationRun }>;
  /** Kick off the inventory-sync job template. */
  syncInventory(): Promise<{ run: AutomationRun }>;

  /**
   * Fetch the full detail bundle for a run — job metadata, extra vars, stdout,
   * and a translated timeline. Maps to AAP getJob/getJobStdout/getJobEvents.
   */
  getRunDetails(runId: string): Promise<RunDetails>;

  /**
   * Snapshot of the AWS-backed dynamic inventory: total host count, last
   * sync metadata, and the hosts themselves (translated from the
   * amazon.aws.aws_ec2 plugin's host vars).
   */
  getAwsInventory(): Promise<AwsInventorySnapshot>;

  /** Trigger the AWS dynamic inventory source to sync from EC2. */
  syncAwsInventory(): Promise<{ run: AutomationRun }>;

  /**
   * Toggle the DisableApiTermination attribute on an AWS instance — the
   * AWS-side hard guardrail against destructive API calls.
   */
  setTerminationProtection(vmId: string, enabled: boolean): Promise<{ run: AutomationRun }>;

  /**
   * Add or remove the ManagedBy=ansible tag — the portal's own gate for the
   * Terminate EC2 workflow.
   */
  setManagedByTag(vmId: string, present: boolean): Promise<{ run: AutomationRun }>;

  /**
   * Start or stop an AWS instance. Tag-gated identically to termination —
   * power changes are reversible but stop is destructive for ephemeral storage.
   */
  setInstanceState(vmId: string, desired: "running" | "stopped"): Promise<{ run: AutomationRun }>;

  /** Subscribe to internal state changes. Returns an unsubscribe function. */
  subscribe(listener: (event: ServiceEvent) => void): () => void;
}
