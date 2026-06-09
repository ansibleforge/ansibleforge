/**
 * Runtime configuration for the AAP integration.
 *
 * Defaults target the local sandbox install at https://192.168.64.5/.
 * Override per-deployment via Vite env vars (.env.local for dev, build args
 * for production):
 *
 *   VITE_AAP_CLIENT_ID        OAuth2 application client id (public PKCE client)
 *   VITE_AAP_AUTHORIZE_URL    AAP's /o/authorize/ endpoint (absolute URL, browser redirects here)
 *   VITE_AAP_REDIRECT_URI     Exact URI registered in the AAP application's redirect_uris
 *
 * The token endpoint and all API calls are intentionally *same-origin* —
 * nginx in front of this SPA reverse-proxies /o/token/ and /api/* to AAP, so
 * there is no CORS surface for the browser to negotiate.
 */

const env = import.meta.env;

const fallbackRedirectUri =
  typeof window !== "undefined" ? `${window.location.origin}/oauth/callback` : "";

const toInt = (raw: string | undefined, fallback: number) => {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

export const aapConfig = {
  clientId: env.VITE_AAP_CLIENT_ID ?? "CihDilADRDg1cVptKJlVaX7DosRTQRY2vUKIqocc",
  authorizeUrl: env.VITE_AAP_AUTHORIZE_URL ?? "https://192.168.64.5/o/authorize/",
  redirectUri: env.VITE_AAP_REDIRECT_URI ?? fallbackRedirectUri,
  /** Same-origin: nginx proxies this to AAP. Bearer token used after exchange. */
  tokenUrl: "/o/token/",
  /** Same-origin base for all AAP REST API calls. */
  apiBaseUrl: "",
  /** OAuth scope string. Empty = default scopes. */
  scope: "",
} as const;

/**
 * Resource ids of AAP entities the portal operates against. Defaults match
 * the resources our setup script creates against the sandbox install:
 *   - Inventory id 1: Demo Inventory
 *   - Workflow Template id 10: "Create VM Workflow"
 *   - Workflow Template id 11: "Delete VM Workflow"
 *   - Inventory sync source: not configured (no remote source attached yet)
 *
 * Override per-deployment via VITE_AAP_INVENTORY_ID, VITE_AAP_CREATE_WORKFLOW_ID,
 * VITE_AAP_DELETE_WORKFLOW_ID, VITE_AAP_INVENTORY_SYNC_SOURCE_ID.
 */
export const aapResources = {
  inventoryId: toInt(env.VITE_AAP_INVENTORY_ID, 1),
  /** Workflow Template that provisions a new EC2 instance (-1 = not configured). */
  provisionEc2TemplateId: toInt(env.VITE_AAP_PROVISION_EC2_WORKFLOW_ID, 23),
  /** Job Template returning per-region AWS options for the create form (-1 = not configured). */
  describeOptionsTemplateId: toInt(env.VITE_AAP_AWS_DESCRIBE_OPTIONS_JT_ID, 21),
  deleteVmTemplateId: toInt(env.VITE_AAP_DELETE_WORKFLOW_ID, 11),
  inventorySyncSourceId: toInt(env.VITE_AAP_INVENTORY_SYNC_SOURCE_ID, -1),
  /** AWS dynamic inventory (separate from the portal's create/delete target). */
  awsInventoryId: toInt(env.VITE_AAP_AWS_INVENTORY_ID, 2),
  /** Inventory source backing the AWS dynamic inventory (amazon.aws.aws_ec2). */
  awsInventorySourceId: toInt(env.VITE_AAP_AWS_SOURCE_ID, 12),
  /** Workflow Template that terminates an AWS instance (-1 = not configured). */
  terminateEc2TemplateId: toInt(env.VITE_AAP_TERMINATE_EC2_WORKFLOW_ID, 14),
  /** Toggle DisableApiTermination on an AWS instance (-1 = not configured). */
  terminationProtectionTemplateId: toInt(env.VITE_AAP_TERMINATION_PROTECTION_WORKFLOW_ID, 16),
  /** Add or remove the ManagedBy=ansible tag on an AWS instance (-1 = not configured). */
  managedByTagTemplateId: toInt(env.VITE_AAP_MANAGED_BY_TAG_WORKFLOW_ID, 18),
  /** Start / stop an AWS instance (-1 = not configured). */
  instanceStateTemplateId: toInt(env.VITE_AAP_INSTANCE_STATE_WORKFLOW_ID, 20),
} as const;

/**
 * In-browser SSH terminal. The SPA opens a same-origin WebSocket at `wsPath`,
 * which nginx upgrades and proxies to the vm-portal-gateway container. The
 * gateway authenticates the portal OAuth token, then bridges to the instance
 * via EC2 Instance Connect. Override the path per-deployment if needed.
 */
export const terminalConfig = {
  wsPath: env.VITE_TERMINAL_WS_PATH ?? "/ws/terminal",
  /** Default SSH login user offered to the gateway. */
  defaultSshUser: env.VITE_TERMINAL_SSH_USER ?? "ec2-user",
} as const;
