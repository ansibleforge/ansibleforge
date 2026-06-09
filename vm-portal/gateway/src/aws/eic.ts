/**
 * EC2 Instance Connect: push an ephemeral public key to an instance for a
 * specific OS user. The key is accepted by the instance for ~60 seconds, so the
 * caller must open the SSH connection immediately after this resolves.
 */
import {
  EC2InstanceConnectClient,
  SendSSHPublicKeyCommand,
} from "@aws-sdk/client-ec2-instance-connect";

const clients = new Map<string, EC2InstanceConnectClient>();
function clientFor(region: string): EC2InstanceConnectClient {
  let c = clients.get(region);
  if (!c) {
    c = new EC2InstanceConnectClient({ region });
    clients.set(region, c);
  }
  return c;
}

export async function pushPublicKey(args: {
  instanceId: string;
  region: string;
  availabilityZone: string;
  osUser: string;
  publicKeyOpenSsh: string;
}): Promise<void> {
  await clientFor(args.region).send(
    new SendSSHPublicKeyCommand({
      InstanceId: args.instanceId,
      AvailabilityZone: args.availabilityZone,
      InstanceOSUser: args.osUser,
      SSHPublicKey: args.publicKeyOpenSsh,
    }),
  );
}
