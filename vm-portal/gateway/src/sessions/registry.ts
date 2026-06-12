/**
 * Tracks active terminal sessions to enforce global and per-user concurrency
 * caps. Admission is atomic: try() reserves a slot or returns a reason; every
 * successful reservation must be paired with a release().
 */
import { config } from "../config.js";

export type AdmitResult = { ok: true; release: () => void } | { ok: false; reason: string };

let global = 0;
const perUser = new Map<string, number>();

export function tryAdmit(username: string): AdmitResult {
  if (global >= config.policy.maxSessions) {
    return { ok: false, reason: "server session limit reached" };
  }
  const userCount = perUser.get(username) ?? 0;
  if (userCount >= config.policy.maxSessionsPerUser) {
    return { ok: false, reason: "per-user session limit reached" };
  }
  global += 1;
  perUser.set(username, userCount + 1);

  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      global -= 1;
      const c = (perUser.get(username) ?? 1) - 1;
      if (c <= 0) perUser.delete(username);
      else perUser.set(username, c);
    },
  };
}

export function activeCount(): number {
  return global;
}
