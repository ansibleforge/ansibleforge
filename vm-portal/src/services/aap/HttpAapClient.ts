import type { AapClient } from "./AapClient";
import type { AapJob, AapJobEvent, AapJobStatus, AapLaunchResult } from "./types";

const TERMINAL: ReadonlySet<AapJobStatus> = new Set([
  "successful",
  "failed",
  "error",
  "canceled",
]);

export interface HttpAapClientConfig {
  /**
   * Base URL for AAP — usually empty in this app because nginx proxies
   * /api/* same-origin. Set this only when the SPA is hosted off the same
   * origin as the gateway (and CORS has been configured upstream).
   */
  baseUrl?: string;
  /**
   * Static bearer token (e.g. a Personal Access Token). For the OAuth flow,
   * pass `tokenProvider` instead and we'll read the live token from session
   * storage so refresh-on-401 works.
   */
  token?: string;
  /** Live token lookup, called for every request. Wins over `token`. */
  tokenProvider?: () => { accessToken: string; tokenType: string } | null;
  /** Optional fetch implementation override (used by tests). */
  fetch?: typeof fetch;
}

/**
 * Real AAP REST client. Endpoints are written but the body is not yet
 * exercised — verify response shapes against your controller version before
 * trusting this in production.
 *
 *   POST /api/controller/v2/workflow_job_templates/{id}/launch/
 *   GET  /api/controller/v2/jobs/{id}/
 *   GET  /api/controller/v2/jobs/{id}/stdout/?format=txt
 *   GET  /api/controller/v2/job_events/?job={id}
 */
export class HttpAapClient implements AapClient {
  private readonly config: HttpAapClientConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: HttpAapClientConfig) {
    this.config = config;
    this.fetchImpl = config.fetch ?? fetch.bind(globalThis);
  }

  async launchWorkflowTemplate(
    templateId: number,
    payload: Record<string, unknown>,
  ): Promise<AapLaunchResult> {
    return this.launch(
      `/api/controller/v2/workflow_job_templates/${templateId}/launch/`,
      templateId,
      payload,
    );
  }

  async launchJobTemplate(
    templateId: number,
    payload: Record<string, unknown>,
  ): Promise<AapLaunchResult> {
    return this.launch(
      `/api/controller/v2/job_templates/${templateId}/launch/`,
      templateId,
      payload,
    );
  }

  async launchJobTemplateAndWait(
    templateId: number,
    payload: Record<string, unknown>,
    opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<AapJob> {
    const intervalMs = opts.intervalMs ?? 2000;
    const timeoutMs = opts.timeoutMs ?? 90_000;
    const deadline = Date.now() + timeoutMs;
    const { jobId } = await this.launchJobTemplate(templateId, payload);

    for (;;) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const job = await this.getJob(jobId);
      if (TERMINAL.has(job.status)) {
        if (job.status !== "successful") {
          const tail = (await this.getJobStdout(jobId).catch(() => "")).slice(-600);
          throw new Error(`AAP job ${jobId} ${job.status}.${tail ? `\n${tail}` : ""}`);
        }
        return job;
      }
      if (Date.now() > deadline) {
        throw new Error(`AAP job ${jobId} did not finish within ${timeoutMs}ms (last status: ${job.status}).`);
      }
      await wait(intervalMs);
    }
  }

  private async launch(
    path: string,
    templateId: number,
    payload: Record<string, unknown>,
  ): Promise<AapLaunchResult> {
    const res = await this.request(path, { method: "POST", body: JSON.stringify(payload) });
    const data = (await res.json()) as {
      job: number;
      workflow_job_template?: number;
      job_template?: number;
      status: AapLaunchResult["status"];
      url: string;
    };
    return {
      jobId: data.job,
      workflowTemplateId: data.workflow_job_template ?? data.job_template ?? templateId,
      status: data.status,
      url: data.url,
    };
  }

  async getJob(jobId: number): Promise<AapJob> {
    const res = await this.request(`/api/controller/v2/jobs/${jobId}/`);
    const data = (await res.json()) as {
      id: number;
      name: string;
      status: AapJob["status"];
      workflow_job_template: number;
      started: string | null;
      finished: string | null;
      failed: boolean;
      extra_vars: string | Record<string, unknown>;
      artifacts?: Record<string, unknown>;
    };
    return {
      id: data.id,
      name: data.name,
      status: data.status,
      workflowTemplateId: data.workflow_job_template,
      started: data.started,
      finished: data.finished,
      failed: data.failed,
      extraVars:
        typeof data.extra_vars === "string"
          ? safeJsonParse(data.extra_vars)
          : data.extra_vars,
      artifacts: data.artifacts ?? {},
    };
  }

  async getJobStdout(jobId: number): Promise<string> {
    // Stdout endpoint returns plain text; the default Accept: application/json
    // triggers a 406 from AAP. Ask for text explicitly.
    const res = await this.request(
      `/api/controller/v2/jobs/${jobId}/stdout/?format=txt`,
      { headers: { Accept: "text/plain" } },
    );
    return res.text();
  }

  async getJobEvents(jobId: number): Promise<AapJobEvent[]> {
    // AAP 2.7 only exposes events nested under their job — the top-level
    // /api/controller/v2/job_events/ collection returns 404.
    const res = await this.request(`/api/controller/v2/jobs/${jobId}/job_events/?page_size=200`);
    const data = (await res.json()) as {
      results: Array<{
        id: number;
        job: number;
        event: string;
        task?: string;
        host_name?: string;
        stdout?: string;
        created: string;
      }>;
    };
    return data.results.map((row) => ({
      id: row.id,
      jobId: row.job,
      eventType: row.event,
      task: row.task,
      host: row.host_name,
      stdout: row.stdout,
      created: row.created,
    }));
  }

  // ---- internals -------------------------------------------------------

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const auth = this.authHeader();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (auth) headers["Authorization"] = auth;

    const res = await this.fetchImpl((this.config.baseUrl ?? "") + path, {
      ...init,
      headers,
    });
    if (!res.ok) {
      throw new Error(`AAP request failed: ${res.status} ${res.statusText} (${path})`);
    }
    return res;
  }

  private authHeader(): string | null {
    if (this.config.tokenProvider) {
      const live = this.config.tokenProvider();
      if (live) return `${live.tokenType} ${live.accessToken}`;
    }
    if (this.config.token) return `Bearer ${this.config.token}`;
    return null;
  }
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
