/**
 * Environment-driven configuration for the gateway. Mirrors the style of the
 * SPA's src/config.ts: a single typed const with small parse helpers and
 * sensible fallbacks. See .env.example for the full list and meaning.
 */

const env = process.env;

function toInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function toList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: toInt(env.PORT, 8081),

  aap: {
    baseUrl: (env.AAP_BASE_URL ?? "https://host.containers.internal").replace(/\/$/, ""),
    tlsHost: env.AAP_TLS_HOST ?? "aap1.local",
    /** Sandbox-only: skip TLS verification of the self-signed AAP cert. */
    tlsInsecure: toBool(env.AAP_TLS_INSECURE, true),
  },

  aws: {
    region: env.AWS_REGION ?? "us-east-2",
  },

  ssh: {
    defaultUser: env.DEFAULT_SSH_USER ?? "ec2-user",
    readyTimeoutMs: toInt(env.SSH_READY_TIMEOUT_MS, 15_000),
  },

  policy: {
    allowedRegions: toList(env.ALLOWED_REGIONS, [
      "us-east-1",
      "us-east-2",
      "us-west-2",
      "eu-west-1",
      "ap-southeast-2",
    ]),
    requireManagedByAnsible: toBool(env.REQUIRE_MANAGED_BY_ANSIBLE, true),
    idleTimeoutMs: toInt(env.IDLE_TIMEOUT_MS, 600_000),
    maxSessionMs: toInt(env.MAX_SESSION_MS, 3_600_000),
    maxSessions: toInt(env.MAX_SESSIONS, 50),
    maxSessionsPerUser: toInt(env.MAX_SESSIONS_PER_USER, 5),
  },
} as const;

export type Config = typeof config;
