import type { AapClient } from "./AapClient";
import type {
  AapJob,
  AapJobEvent,
  AapJobStatus,
  AapLaunchResult,
} from "./types";

interface MockAapClientOptions {
  /** Milliseconds before a launched job flips from "pending" to "running". */
  pendingMs?: number;
  /** Milliseconds the job stays "running" before reaching a terminal state. */
  runningMs?: number;
  /** Probability (0..1) that a finished job ends in "failed" instead of "successful". */
  failureRate?: number;
  /** Pre-populated jobs (used by the mock service to back its seed runs). */
  seedJobs?: SeededJob[];
}

export interface SeededJob {
  id: number;
  name: string;
  status: AapJobStatus;
  workflowTemplateId: number;
  started: string | null;
  finished: string | null;
  failed?: boolean;
  extraVars?: Record<string, unknown>;
  artifacts?: Record<string, unknown>;
  stdout?: string;
  events?: AapJobEvent[];
}

const TEMPLATE_NAMES: Record<number, string> = {
  42: "Create VM Workflow",
  43: "Delete VM Workflow",
  44: "Provision EC2 Workflow",
  45: "AWS Describe Options",
  7: "VM Inventory Sync",
};

const nowIso = () => new Date().toISOString();

/**
 * In-memory AAP simulator. Each launched job progresses through pending →
 * running → successful (or failed) over a few seconds, mimicking what a real
 * controller would do via async job execution.
 */
export class MockAapClient implements AapClient {
  private jobs = new Map<number, AapJob>();
  private eventsByJob = new Map<number, AapJobEvent[]>();
  private stdoutByJob = new Map<number, string>();
  private nextJobId = 1000;
  private nextEventId = 5000;

  private options: MockAapClientOptions;

  constructor(options: MockAapClientOptions = {}) {
    this.options = options;
    for (const seed of options.seedJobs ?? []) this.ingestSeed(seed);
  }

  private ingestSeed(seed: SeededJob) {
    const job: AapJob = {
      id: seed.id,
      name: seed.name,
      status: seed.status,
      workflowTemplateId: seed.workflowTemplateId,
      started: seed.started,
      finished: seed.finished,
      failed: seed.failed ?? seed.status === "failed",
      extraVars: seed.extraVars ?? {},
      artifacts: seed.artifacts ?? {},
    };
    this.jobs.set(seed.id, job);
    this.stdoutByJob.set(seed.id, seed.stdout ?? "");
    this.eventsByJob.set(seed.id, seed.events ?? []);
    if (seed.id >= this.nextJobId) this.nextJobId = seed.id + 1;
    const maxEventId = (seed.events ?? []).reduce((m, e) => (e.id > m ? e.id : m), this.nextEventId - 1);
    this.nextEventId = maxEventId + 1;
  }

  private get pendingMs() {
    return this.options.pendingMs ?? 400;
  }
  private get runningMs() {
    return this.options.runningMs ?? 2800;
  }
  private get failureRate() {
    return this.options.failureRate ?? 0;
  }

  async launchWorkflowTemplate(
    templateId: number,
    payload: Record<string, unknown>,
  ): Promise<AapLaunchResult> {
    const jobId = this.nextJobId++;
    const job: AapJob = {
      id: jobId,
      name: TEMPLATE_NAMES[templateId] ?? `workflow-template-${templateId}`,
      status: "pending",
      workflowTemplateId: templateId,
      started: null,
      finished: null,
      failed: false,
      extraVars: (payload.extra_vars as Record<string, unknown>) ?? {},
      artifacts: {},
    };
    this.jobs.set(jobId, job);
    this.eventsByJob.set(jobId, [
      this.makeEvent(jobId, "playbook_on_start", undefined, undefined),
    ]);
    this.stdoutByJob.set(jobId, `Launching ${job.name}...\n`);

    void this.advanceJob(jobId);

    return {
      jobId,
      workflowTemplateId: templateId,
      status: "pending",
      url: `/api/v2/jobs/${jobId}/`,
    };
  }

  /** Job Templates progress identically to workflows in the simulator. */
  async launchJobTemplate(
    templateId: number,
    payload: Record<string, unknown>,
  ): Promise<AapLaunchResult> {
    return this.launchWorkflowTemplate(templateId, payload);
  }

  async launchJobTemplateAndWait(
    templateId: number,
    payload: Record<string, unknown>,
    opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<AapJob> {
    const { jobId } = await this.launchJobTemplate(templateId, payload);
    const intervalMs = opts.intervalMs ?? 150;
    for (;;) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const job = await this.getJob(jobId);
      if (["successful", "failed", "error", "canceled"].includes(job.status)) {
        if (job.status !== "successful") throw new Error(`Mock job ${jobId} ${job.status}.`);
        return job;
      }
      await wait(intervalMs);
    }
  }

  async getJob(jobId: number): Promise<AapJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    // Return a shallow copy so callers can't mutate our internal state.
    return { ...job, extraVars: { ...job.extraVars }, artifacts: { ...job.artifacts } };
  }

  async getJobStdout(jobId: number): Promise<string> {
    return this.stdoutByJob.get(jobId) ?? "";
  }

  async getJobEvents(jobId: number): Promise<AapJobEvent[]> {
    return [...(this.eventsByJob.get(jobId) ?? [])];
  }

  // ---- internals -------------------------------------------------------

  private async advanceJob(jobId: number) {
    await wait(this.pendingMs);
    this.transition(jobId, "running");

    await wait(this.runningMs);
    const succeed = Math.random() >= this.failureRate;
    this.transition(jobId, succeed ? "successful" : "failed");
  }

  private transition(jobId: number, status: AapJobStatus) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (status === "running" && !job.started) job.started = nowIso();
    if (status === "successful" || status === "failed" || status === "canceled") {
      job.finished = nowIso();
      job.failed = status !== "successful";
    }
    job.status = status;

    const events = this.eventsByJob.get(jobId) ?? [];
    events.push(this.makeEvent(jobId, this.eventTypeFor(status)));
    this.eventsByJob.set(jobId, events);

    const stdout = this.stdoutByJob.get(jobId) ?? "";
    this.stdoutByJob.set(
      jobId,
      stdout + `[${nowIso()}] ${job.name} -> ${status}\n`,
    );
  }

  private eventTypeFor(status: AapJobStatus): string {
    switch (status) {
      case "running": return "playbook_on_task_start";
      case "successful": return "playbook_on_stats";
      case "failed": return "runner_on_failed";
      case "canceled": return "playbook_on_no_hosts_matched";
      default: return "verbose";
    }
  }

  private makeEvent(
    jobId: number,
    eventType: string,
    task?: string,
    host?: string,
  ): AapJobEvent {
    return {
      id: this.nextEventId++,
      jobId,
      eventType,
      task,
      host,
      created: nowIso(),
    };
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
