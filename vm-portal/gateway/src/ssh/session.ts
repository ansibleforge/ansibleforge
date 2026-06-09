/**
 * SSH client session wrapper over ssh2: connect with the ephemeral key, open an
 * interactive PTY shell, and expose a small callback surface for the WS layer to
 * pipe bytes, resize, and tear down. Host keys are accepted TOFU-style (instances
 * are ephemeral) but the fingerprint is captured for the audit log.
 */
import { createHash } from "node:crypto";
import ssh2, { type ClientChannel } from "ssh2";

const { Client } = ssh2;

export type SshConnectErrorKind = "timeout" | "auth" | "other";

export class SshConnectError extends Error {
  constructor(
    message: string,
    readonly kind: SshConnectErrorKind,
  ) {
    super(message);
    this.name = "SshConnectError";
  }
}

export interface SshSessionHandlers {
  onData: (chunk: Buffer) => void;
  onClose: () => void;
}

export interface SshSessionOpts {
  host: string;
  port?: number;
  username: string;
  privateKeyPem: string;
  cols: number;
  rows: number;
  readyTimeoutMs: number;
}

export interface SshSession {
  /** SHA-256 host-key fingerprint observed at connect time (for audit). */
  hostKeyFingerprint: string;
  write(data: Buffer): void;
  resize(cols: number, rows: number): void;
  /** Backpressure: pause/resume the inbound (instance→client) stream. */
  pause(): void;
  resume(): void;
  end(): void;
}

/** Connect + open a shell. Resolves once the interactive channel is ready. */
export function openSshSession(opts: SshSessionOpts, handlers: SshSessionHandlers): Promise<SshSession> {
  return new Promise<SshSession>((resolve, reject) => {
    const conn = new Client();
    let fingerprint = "";
    let settled = false;

    const failConnect = (err: SshConnectError) => {
      if (settled) return;
      settled = true;
      conn.end();
      reject(err);
    };

    conn.on("ready", () => {
      conn.shell({ term: "xterm-256color", cols: opts.cols, rows: opts.rows }, (err, stream: ClientChannel) => {
        if (err) {
          failConnect(new SshConnectError(`shell open failed: ${err.message}`, "other"));
          return;
        }
        settled = true;
        stream.on("data", (chunk: Buffer) => handlers.onData(chunk));
        stream.stderr.on("data", (chunk: Buffer) => handlers.onData(chunk));
        stream.on("close", () => {
          handlers.onClose();
          conn.end();
        });
        resolve({
          hostKeyFingerprint: fingerprint,
          write: (data) => stream.write(data),
          resize: (cols, rows) => stream.setWindow(rows, cols, 0, 0),
          pause: () => stream.pause(),
          resume: () => stream.resume(),
          end: () => {
            stream.end();
            conn.end();
          },
        });
      });
    });

    conn.on("error", (err: Error & { level?: string }) => {
      const msg = err.message || "ssh error";
      // ssh2 surfaces auth failures with level "client-authentication".
      const kind: SshConnectErrorKind =
        err.level === "client-authentication"
          ? "auth"
          : /timed out|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH/i.test(msg)
            ? "timeout"
            : "other";
      failConnect(new SshConnectError(msg, kind));
    });

    conn.connect({
      host: opts.host,
      port: opts.port ?? 22,
      username: opts.username,
      privateKey: opts.privateKeyPem,
      readyTimeout: opts.readyTimeoutMs,
      hostVerifier: (key: Buffer) => {
        // TOFU: ephemeral instances have no stable known-hosts entry. Record the
        // fingerprint for the audit trail rather than pinning.
        fingerprint = "SHA256:" + createHash("sha256").update(key).digest("base64").replace(/=+$/, "");
        return true;
      },
    });
  });
}
