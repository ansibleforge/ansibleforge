/**
 * Generates a per-session ephemeral ed25519 keypair, held only in memory.
 * Returns the public key in OpenSSH wire format (what EC2 Instance Connect's
 * SendSSHPublicKey expects) and the private key in OpenSSH PEM (what ssh2
 * parses — note ssh2 does NOT accept PKCS#8 ed25519, so we use its own keygen).
 *
 * ed25519 keygen is sub-millisecond, which matters against EIC's ~60s key
 * validity window.
 */
import ssh2 from "ssh2";

const sshUtils = ssh2.utils;

export interface EphemeralKey {
  /** OpenSSH format: "ssh-ed25519 AAAA...". For EIC SendSSHPublicKey. */
  publicKeyOpenSsh: string;
  /** OpenSSH private key PEM. For ssh2 Client `privateKey`. */
  privateKeyPem: string;
}

export function generateEphemeralKey(): EphemeralKey {
  const { public: publicKey, private: privateKey } = sshUtils.generateKeyPairSync("ed25519");
  return {
    publicKeyOpenSsh: publicKey.trim(),
    privateKeyPem: privateKey,
  };
}
