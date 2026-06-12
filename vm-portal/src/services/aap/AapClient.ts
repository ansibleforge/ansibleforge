import type { AapJob, AapJobEvent, AapLaunchResult } from "./types";

/**
 * Low-level adapter over AAP Controller's REST API.
 *
 * Implementations:
 *   - {@link MockAapClient}: in-memory, simulates job progression.
 *   - {@link HttpAapClient}: real REST client (stubbed until wired).
 *
 * Higher-level domain workflows (createVm, deleteVm, syncInventory, ...) live
 * in VmAutomationService and call this interface — they should not call
 * `fetch` or know about AAP URL shapes directly.
 */
export interface AapClient {
  /**
   * POST /api/v2/workflow_job_templates/{templateId}/launch/
   *
   * The `payload` is sent as the launch body; the most common field is
   * `extra_vars`, but credentials, inventory, etc. may also be passed.
   */
  launchWorkflowTemplate(
    templateId: number,
    payload: Record<string, unknown>,
  ): Promise<AapLaunchResult>;

  /**
   * POST /api/v2/job_templates/{templateId}/launch/
   *
   * Like {@link launchWorkflowTemplate} but for a plain Job Template (different
   * URL segment). Used for read-only lookups (e.g. AWS describe-options).
   */
  launchJobTemplate(
    templateId: number,
    payload: Record<string, unknown>,
  ): Promise<AapLaunchResult>;

  /**
   * Launch a Job Template and poll until it reaches a terminal state, then
   * return the finished job (including `artifacts`). Rejects on a failed/
   * errored/canceled job or if the timeout elapses.
   */
  launchJobTemplateAndWait(
    templateId: number,
    payload: Record<string, unknown>,
    opts?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AapJob>;

  /** GET /api/v2/jobs/{jobId}/ */
  getJob(jobId: number): Promise<AapJob>;

  /** GET /api/v2/jobs/{jobId}/stdout/?format=txt */
  getJobStdout(jobId: number): Promise<string>;

  /** GET /api/v2/job_events/?job={jobId} */
  getJobEvents(jobId: number): Promise<AapJobEvent[]>;
}
