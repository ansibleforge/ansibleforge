import { describe, expect, it } from "vitest";
import { generateEphemeralKey } from "../src/ssh/ephemeralKey.js";

describe("generateEphemeralKey", () => {
  it("produces an OpenSSH ed25519 public key and an OpenSSH private key", () => {
    const k = generateEphemeralKey();
    expect(k.publicKeyOpenSsh).toMatch(/^ssh-ed25519 [A-Za-z0-9+/]+=*( .*)?$/);
    expect(k.privateKeyPem).toContain("-----BEGIN OPENSSH PRIVATE KEY-----");
  });

  it("returns a fresh keypair each call", () => {
    expect(generateEphemeralKey().publicKeyOpenSsh).not.toBe(generateEphemeralKey().publicKeyOpenSsh);
  });
});
