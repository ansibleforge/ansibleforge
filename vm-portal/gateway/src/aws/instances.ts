/**
 * Resolves an instance's authoritative facts from AWS — state, public IP,
 * availability zone, and tags. The gateway NEVER trusts a client-supplied IP;
 * it always re-resolves from DescribeInstances so authorization can't be spoofed.
 */
import { DescribeInstancesCommand, EC2Client } from "@aws-sdk/client-ec2";

export interface ResolvedInstance {
  instanceId: string;
  state: string;
  publicIp?: string;
  availabilityZone?: string;
  tags: Record<string, string>;
}

export class InstanceNotFoundError extends Error {
  constructor(instanceId: string) {
    super(`instance ${instanceId} not found`);
    this.name = "InstanceNotFoundError";
  }
}

const clients = new Map<string, EC2Client>();
function clientFor(region: string): EC2Client {
  let c = clients.get(region);
  if (!c) {
    c = new EC2Client({ region });
    clients.set(region, c);
  }
  return c;
}

export async function resolveInstance(instanceId: string, region: string): Promise<ResolvedInstance> {
  const out = await clientFor(region).send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
  );
  const instance = out.Reservations?.[0]?.Instances?.[0];
  if (!instance) throw new InstanceNotFoundError(instanceId);

  const tags: Record<string, string> = {};
  for (const t of instance.Tags ?? []) {
    if (t.Key && t.Value !== undefined) tags[t.Key] = t.Value;
  }

  return {
    instanceId,
    state: instance.State?.Name ?? "unknown",
    publicIp: instance.PublicIpAddress,
    availabilityZone: instance.Placement?.AvailabilityZone,
    tags,
  };
}
