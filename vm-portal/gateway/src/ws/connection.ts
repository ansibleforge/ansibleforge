/**
 * Per-WebSocket connection state machine. The ORDER below is the security
 * contract — nothing touches AWS or SSH until the OAuth token is validated and
 * the instance passes the authorization check:
 *
 *   init frame → validate OAuth token → DescribeInstances → authorize
 *   (running + ManagedBy=ansible) → ephemeral key → EIC push → SSH PTY → pipe.
 *
 * Teardown is a single idempotent cleanup() fired by any of: WS close, SSH
 * close/error, idle timeout, absolute timeout, or a fatal error en route.
 */
import type { RawData, WebSocket } from "ws";
import { config } from "../config.js";
import { log } from "../log.js";
import { AuthError, validateToken } from "../auth/aapToken.js";
import { InstanceNotFoundError, resolveInstance } from "../aws/instances.js";
import { pushPublicKey } from "../aws/eic.js";
import { generateEphemeralKey } from "../ssh/ephemeralKey.js";
import { openSshSession, SshConnectError, type SshSession } from "../ssh/session.js";
import { tryAdmit } from "../sessions/registry.js";
import {
  encode,
  parseControl,
  parseInit,
  type ErrorCode,
} from "./protocol.js";

const WS_NORMAL = 1000;
const WS_POLICY = 1008;
const WS_INTERNAL = 1011;
const WS_TRY_LATER = 1013;

// Backpressure watermarks on the WS send buffer (instance→client direction).
const BUFFER_HIGH = 1024 * 1024;
const BUFFER_LOW = 256 * 1024;

export function handleConnection(ws: WebSocket, clientIp: string): void {
  let phase: "await_init" | "connecting" | "streaming" | "closed" = "await_init";
  let ssh: SshSession | null = null;
  let release: (() => void) | null = null;
  let idleTimer: NodeJS.Timeout | null = null;
  let absoluteTimer: NodeJS.Timeout | null = null;
  let username = "?";
  let instanceId = "?";
  let paused = false;

  const fail = (code: ErrorCode, message: string, wsCode: number) => {
    if (phase === "closed") return;
    try {
      ws.send(encode({ type: "error", code, message }));
    } catch {
      /* socket may already be gone */
    }
    cleanup(`error:${code}`, wsCode);
  };

  const cleanup = (reason: string, wsCode = WS_NORMAL) => {
    if (phase === "closed") return;
    phase = "closed";
    if (idleTimer) clearTimeout(idleTimer);
    if (absoluteTimer) clearTimeout(absoluteTimer);
    try {
      ssh?.end();
    } catch {
      /* ignore */
    }
    try {
      ws.close(wsCode);
    } catch {
      /* ignore */
    }
    release?.();
    log.audit("session_close", { reason, username, instanceId, clientIp });
  };

  const bumpIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => fail("idle_timeout", "Session idle too long; closing.", WS_NORMAL),
      config.policy.idleTimeoutMs,
    );
  };

  ws.on("close", () => cleanup("ws_close"));
  ws.on("error", () => cleanup("ws_error", WS_INTERNAL));

  ws.on("message", (data: RawData, isBinary: boolean) => {
    if (phase === "closed") return;

    // Streaming phase: binary = stdin to the shell, text = control (resize).
    if (phase === "streaming" && ssh) {
      bumpIdle();
      if (isBinary) {
        ssh.write(toBuffer(data));
      } else {
        const ctrl = parseControl(toBuffer(data).toString("utf8"));
        if (ctrl?.type === "resize") ssh.resize(ctrl.cols, ctrl.rows);
      }
      return;
    }

    // Pre-init: only the init text frame is allowed; anything else is a violation.
    if (phase === "await_init") {
      if (isBinary) {
        fail("bad_request", "Expected an init message before any data.", WS_POLICY);
        return;
      }
      phase = "connecting";
      void runHandshake(toBuffer(data).toString("utf8"));
      return;
    }
    // phase === "connecting": ignore stray frames until the handshake settles.
  });

  async function runHandshake(raw: string): Promise<void> {
    const parsed = parseInit(raw, config.policy.allowedRegions);
    if (!parsed.ok) {
      fail("bad_request", parsed.message, WS_POLICY);
      return;
    }
    const init = parsed.value;
    instanceId = init.instanceId;
    const sshUser = init.user ?? config.ssh.defaultUser;

    // 1. OAuth gate — mandatory, first.
    try {
      username = await validateToken(init.token);
    } catch (err) {
      if (err instanceof AuthError && err.kind === "unauthorized") {
        fail("unauthorized", "Your session is not authenticated.", WS_POLICY);
      } else {
        fail("auth_unavailable", "Could not verify your session with AAP.", WS_INTERNAL);
      }
      return;
    }

    // 2. Concurrency admission.
    const admit = tryAdmit(username);
    if (!admit.ok) {
      fail("too_many_sessions", admit.reason, WS_TRY_LATER);
      return;
    }
    release = admit.release;

    // 3. Resolve instance facts (authoritative — never trust the client).
    let instance;
    try {
      instance = await resolveInstance(init.instanceId, init.region);
    } catch (err) {
      if (err instanceof InstanceNotFoundError) {
        fail("instance_not_found", "That instance was not found in this region.", WS_POLICY);
      } else {
        fail("aws_unavailable", "Could not query AWS for the instance.", WS_INTERNAL);
      }
      return;
    }

    // 4. Authorize.
    if (instance.state !== "running") {
      fail("forbidden", `Instance is ${instance.state}; must be running.`, WS_POLICY);
      return;
    }
    if (config.policy.requireManagedByAnsible && instance.tags["ManagedBy"] !== "ansible") {
      fail("forbidden", "Instance is not tagged ManagedBy=ansible.", WS_POLICY);
      return;
    }
    if (!instance.publicIp) {
      fail("no_public_ip", "Instance has no public IPv4; in-browser SSH needs one.", WS_POLICY);
      return;
    }
    if (!instance.availabilityZone) {
      fail("aws_unavailable", "Instance has no availability zone.", WS_INTERNAL);
      return;
    }

    log.audit("session_authorized", {
      username,
      instanceId: init.instanceId,
      region: init.region,
      sshUser,
      clientIp,
    });

    // 5–6. Ephemeral key + EIC push (key valid ~60s — connect immediately after).
    const key = generateEphemeralKey();
    try {
      await pushPublicKey({
        instanceId: init.instanceId,
        region: init.region,
        availabilityZone: instance.availabilityZone,
        osUser: sshUser,
        publicKeyOpenSsh: key.publicKeyOpenSsh,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/AccessDenied|UnauthorizedOperation/i.test(msg)) {
        fail("forbidden", "The gateway is not permitted to connect to this instance.", WS_POLICY);
      } else {
        fail("aws_unavailable", "EC2 Instance Connect push failed.", WS_INTERNAL);
      }
      return;
    }

    // 7–8. SSH connect + interactive shell.
    try {
      ssh = await openSshSession(
        {
          host: instance.publicIp,
          username: sshUser,
          privateKeyPem: key.privateKeyPem,
          cols: init.cols,
          rows: init.rows,
          readyTimeoutMs: config.ssh.readyTimeoutMs,
        },
        {
          onData: (chunk) => {
            if (phase === "closed") return;
            bumpIdle();
            ws.send(chunk, { binary: true }, () => {
              if (paused && ws.bufferedAmount < BUFFER_LOW) {
                paused = false;
                ssh?.resume();
              }
            });
            if (!paused && ws.bufferedAmount > BUFFER_HIGH) {
              paused = true;
              ssh?.pause();
            }
          },
          onClose: () => cleanup("ssh_close"),
        },
      );
    } catch (err) {
      if (err instanceof SshConnectError && err.kind === "timeout") {
        fail(
          "ssh_connect_timeout",
          "Could not reach the instance on port 22 — check the security group allows SSH from the gateway.",
          WS_NORMAL,
        );
      } else if (err instanceof SshConnectError && err.kind === "auth") {
        fail(
          "ssh_auth_failed",
          "SSH auth failed — the instance may lack the EC2 Instance Connect agent (e.g. RHEL/Windows AMIs).",
          WS_NORMAL,
        );
      } else {
        fail("internal_error", "Failed to open the SSH session.", WS_INTERNAL);
      }
      return;
    }

    // 9. Streaming.
    phase = "streaming";
    ws.send(encode({ type: "ready", host: instance.publicIp, user: sshUser, instanceId: init.instanceId }));
    log.audit("session_open", {
      username,
      instanceId: init.instanceId,
      region: init.region,
      sshUser,
      hostKeyFingerprint: ssh.hostKeyFingerprint,
      clientIp,
    });
    bumpIdle();
    absoluteTimer = setTimeout(
      () => fail("session_expired", "Maximum session duration reached.", WS_NORMAL),
      config.policy.maxSessionMs,
    );
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}
