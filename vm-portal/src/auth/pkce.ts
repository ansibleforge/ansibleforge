/**
 * PKCE (RFC 7636) helpers.
 *
 * Uses native crypto.subtle.digest when available; falls back to a pure-JS
 * SHA-256 implementation on insecure origins (plain-HTTP IP addresses, where
 * `crypto.subtle` is undefined). crypto.getRandomValues is always available,
 * even on insecure contexts.
 */

import { sha256 } from "./sha256";

function base64UrlEncode(buf: ArrayBuffer): string {
  // ArrayBuffer → base64 → URL-safe (RFC 4648 §5).
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A 32-byte random verifier, base64url-encoded → 43 chars (within RFC 7636 limits). */
export function generateCodeVerifier(): string {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  return base64UrlEncode(random.buffer);
}

/** SHA-256(verifier), base64url-encoded. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  if (typeof crypto.subtle?.digest === "function") {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(digest);
  }
  // Fallback for insecure origins (e.g. http://<ip>:port/).
  const digest = sha256(data);
  return base64UrlEncode(digest.buffer as ArrayBuffer);
}

/** Cryptographically random opaque state used to defend against CSRF on the callback. */
export function generateState(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return base64UrlEncode(random.buffer);
}
