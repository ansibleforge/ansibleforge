/**
 * Validates a portal OAuth access token by calling AAP's gateway "me" endpoint
 * — the exact check the SPA uses (src/auth/AuthContext.tsx). This is the single
 * authorization gate: no AWS or SSH action happens until it returns a username.
 *
 * Uses node:https directly (not fetch) so we can set the SNI/Host for the
 * self-signed AAP cert and, in the sandbox, tolerate it. Connect host comes
 * from AAP_BASE_URL; the TLS servername + Host header are AAP_TLS_HOST.
 */
import https from "node:https";
import { config } from "../config.js";

/** Distinguishes "token is bad" (401/403) from "couldn't check" (network/5xx). */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly kind: "unauthorized" | "unavailable",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

interface MeResponse {
  username?: string;
  results?: Array<{ username?: string }>;
}

/** Returns the authenticated username, or throws AuthError. */
export function validateToken(token: string): Promise<string> {
  const base = new URL(config.aap.baseUrl);
  const options: https.RequestOptions = {
    host: base.hostname,
    port: base.port || 443,
    path: "/api/gateway/v1/me/",
    method: "GET",
    servername: config.aap.tlsHost,
    rejectUnauthorized: !config.aap.tlsInsecure,
    headers: {
      Host: config.aap.tlsHost,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    timeout: 10_000,
  };

  return new Promise<string>((resolve, reject) => {
    const req = https.request(options, (res) => {
      const status = res.statusCode ?? 0;
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        if (status === 401 || status === 403) {
          reject(new AuthError("token rejected by AAP", "unauthorized"));
          return;
        }
        if (status < 200 || status >= 300) {
          reject(new AuthError(`AAP returned ${status}`, "unavailable"));
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as MeResponse;
          const username = body.username ?? body.results?.[0]?.username;
          if (!username) {
            reject(new AuthError("AAP response had no username", "unavailable"));
            return;
          }
          resolve(username);
        } catch {
          reject(new AuthError("could not parse AAP response", "unavailable"));
        }
      });
    });
    req.on("error", (err) => reject(new AuthError(`AAP request failed: ${err.message}`, "unavailable")));
    req.on("timeout", () => {
      req.destroy();
      reject(new AuthError("AAP request timed out", "unavailable"));
    });
    req.end();
  });
}
