/**
 * WebSocket wire protocol between the browser terminal and this gateway.
 *
 * Control messages are JSON *text* frames; terminal I/O is *binary* frames.
 * Disambiguation is by frame type: a text frame is always a control message,
 * a binary frame is always raw terminal bytes (stdin client→server, stdout
 * server→client). The OAuth token rides in the first `init` text frame — never
 * in the URL or HTTP headers — so it stays out of access logs.
 */

/** Bound on a single control frame; terminal I/O uses binary frames. */
export const MAX_CONTROL_FRAME_BYTES = 64 * 1024;
/** ws server maxPayload (covers binary stdin too). */
export const MAX_PAYLOAD_BYTES = 1024 * 1024;

export interface InitMessage {
  type: "init";
  /** Portal OAuth access token (Bearer). Validated against AAP before any AWS/SSH call. */
  token: string;
  /** EC2 instance-id, e.g. "i-0abc123...". */
  instanceId: string;
  /** AWS region; must be in the gateway's allowlist. */
  region: string;
  /** SSH login user; defaults to the gateway's DEFAULT_SSH_USER when omitted. */
  user?: string;
  cols?: number;
  rows?: number;
}

export interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

/** Anything the client may send as a control (text) frame. */
export type ClientControlMessage = InitMessage | ResizeMessage;

export interface ReadyMessage {
  type: "ready";
  /** Echoed connection facts the UI can show (no secrets). */
  host: string;
  user: string;
  instanceId: string;
}

/** Machine-readable error codes surfaced to the UI for tailored messaging. */
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "auth_unavailable"
  | "instance_not_found"
  | "forbidden"
  | "no_public_ip"
  | "ssh_connect_timeout"
  | "ssh_auth_failed"
  | "too_many_sessions"
  | "idle_timeout"
  | "session_expired"
  | "aws_unavailable"
  | "internal_error";

export interface ErrorMessage {
  type: "error";
  code: ErrorCode;
  message: string;
}

export type ServerControlMessage = ReadyMessage | ErrorMessage;

const INSTANCE_ID_RE = /^i-[0-9a-f]{8,}$/;
const SSH_USER_RE = /^[a-z_][a-z0-9_-]*$/;

export interface ParsedInit {
  ok: true;
  value: Required<Pick<InitMessage, "token" | "instanceId" | "region">> & {
    user?: string;
    cols: number;
    rows: number;
  };
}
export interface ParseFailure {
  ok: false;
  message: string;
}

/**
 * Parse + validate a raw text frame as an `init` message. Returns a discriminated
 * result so callers handle failure explicitly (no throwing on the hot path).
 */
export function parseInit(raw: string, allowedRegions: readonly string[]): ParsedInit | ParseFailure {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { ok: false, message: "init frame is not valid JSON" };
  }
  if (!isRecord(obj) || obj.type !== "init") {
    return { ok: false, message: "first frame must be an init message" };
  }
  const { token, instanceId, region, user, cols, rows } = obj;
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, message: "init.token is required" };
  }
  if (typeof instanceId !== "string" || !INSTANCE_ID_RE.test(instanceId)) {
    return { ok: false, message: "init.instanceId must look like i-0123abcd" };
  }
  if (typeof region !== "string" || !allowedRegions.includes(region)) {
    return { ok: false, message: "init.region is not in the allowed set" };
  }
  if (user !== undefined && (typeof user !== "string" || !SSH_USER_RE.test(user))) {
    return { ok: false, message: "init.user is not a valid Linux username" };
  }
  return {
    ok: true,
    value: {
      token,
      instanceId,
      region,
      user: typeof user === "string" ? user : undefined,
      cols: clampDim(cols, 80),
      rows: clampDim(rows, 24),
    },
  };
}

/** Parse a non-init control frame (currently only `resize`). */
export function parseControl(raw: string): ResizeMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isRecord(obj) && obj.type === "resize") {
    return { type: "resize", cols: clampDim(obj.cols, 80), rows: clampDim(obj.rows, 24) };
  }
  return null;
}

export function encode(msg: ServerControlMessage): string {
  return JSON.stringify(msg);
}

function clampDim(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? Math.floor(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1000, Math.max(1, n));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
