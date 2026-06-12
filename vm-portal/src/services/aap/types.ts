/**
 * AAP Controller REST DTOs.
 *
 * These mirror the shape of the upstream AAP Controller v2 API. They are
 * deliberately the only place AAP-specific field names live — the rest of the
 * app talks to {@link VmAutomationService} in domain terms (VM, AutomationRun).
 *
 * Upstream references:
 *   GET  /api/v2/jobs/{id}/
 *   POST /api/v2/workflow_job_templates/{id}/launch/
 *   GET  /api/v2/job_events/?job={id}
 *   GET  /api/v2/jobs/{id}/stdout/
 */

export type AapJobStatus =
  | "pending"
  | "waiting"
  | "running"
  | "successful"
  | "failed"
  | "error"
  | "canceled";

export interface AapLaunchResult {
  /** Job id created by the launch (corresponds to `id` on the returned job). */
  jobId: number;
  /** Template that was launched. */
  workflowTemplateId: number;
  /** Initial status as reported by AAP — usually "pending" or "waiting". */
  status: AapJobStatus;
  /** Path under /api/v2/jobs/ where the job lives. */
  url: string;
}

export interface AapJob {
  id: number;
  name: string;
  status: AapJobStatus;
  /** Workflow template that spawned this job. */
  workflowTemplateId: number;
  /** ISO-8601 timestamp or null while still pending. */
  started: string | null;
  finished: string | null;
  failed: boolean;
  /** Extra vars that were submitted with the launch. */
  extraVars: Record<string, unknown>;
  /** Structured outputs emitted by the playbook via `set_stats` (empty if none). */
  artifacts: Record<string, unknown>;
}

export interface AapJobEvent {
  id: number;
  jobId: number;
  /** AAP event types like "playbook_on_task_start", "runner_on_ok", etc. */
  eventType: string;
  task?: string;
  host?: string;
  stdout?: string;
  /** ISO-8601 timestamp. */
  created: string;
}
