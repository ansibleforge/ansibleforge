/**
 * Minimal structured (JSON-line) logger. Never log secrets: no OAuth tokens,
 * no private keys. The audit() helper is for the per-session security trail.
 */

type Fields = Record<string, unknown>;

function emit(level: string, msg: string, fields?: Fields): void {
  const record = { ts: new Date().toISOString(), level, msg, ...fields };
  const line = JSON.stringify(record);
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const log = {
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
  /** Security audit trail for terminal sessions (open/close/authz). */
  audit: (event: string, fields: Fields) => emit("audit", event, fields),
};
