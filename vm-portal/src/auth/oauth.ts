import { aapConfig } from "../config";
import { deriveCodeChallenge, generateCodeVerifier, generateState } from "./pkce";
import { pkceStore, tokenStore, type StoredAuth } from "./tokenStore";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

function storedFrom(response: TokenResponse): StoredAuth {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    tokenType: response.token_type,
  };
}

/**
 * Build the authorize URL and redirect the browser to AAP. The user lands
 * on AAP's gateway login, and AAP redirects back to {@link aapConfig.redirectUri}
 * with `?code=...&state=...`.
 */
export async function startLogin(returnTo: string = "/"): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const state = generateState();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);

  pkceStore.set({ codeVerifier, state, returnTo });

  const url = new URL(aapConfig.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", aapConfig.clientId);
  url.searchParams.set("redirect_uri", aapConfig.redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  if (aapConfig.scope) url.searchParams.set("scope", aapConfig.scope);

  window.location.href = url.toString();
}

/**
 * Called on the /oauth/callback route. Validates state, exchanges the code
 * for a token via the same-origin /o/token/ proxy, persists it.
 */
export async function completeLogin(
  search: URLSearchParams,
): Promise<{ returnTo: string }> {
  const code = search.get("code");
  const incomingState = search.get("state");
  const oauthError = search.get("error");
  if (oauthError) {
    throw new Error(`AAP returned ${oauthError}: ${search.get("error_description") ?? "no details"}`);
  }
  if (!code) throw new Error("OAuth callback missing 'code' parameter");

  const pkce = pkceStore.get();
  if (!pkce) throw new Error("No PKCE flow state found — login was not initiated from this tab");
  if (incomingState !== pkce.state) throw new Error("State parameter mismatch (possible CSRF)");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: aapConfig.redirectUri,
    client_id: aapConfig.clientId,
    code_verifier: pkce.codeVerifier,
  });

  const res = await fetch(aapConfig.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${res.statusText} — ${detail}`);
  }
  const data = (await res.json()) as TokenResponse;
  tokenStore.set(storedFrom(data));
  pkceStore.clear();
  return { returnTo: pkce.returnTo };
}

/** Use the refresh token to mint a new access token. */
export async function refreshTokens(): Promise<StoredAuth> {
  const current = tokenStore.get();
  if (!current?.refreshToken) {
    throw new Error("No refresh token available");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
    client_id: aapConfig.clientId,
  });
  const res = await fetch(aapConfig.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    tokenStore.clear();
    throw new Error(`Refresh failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as TokenResponse;
  const next = storedFrom(data);
  tokenStore.set(next);
  return next;
}

/** POST /o/revoke_token/ to invalidate the refresh token, then clear local storage. */
export async function logout(): Promise<void> {
  const auth = tokenStore.get();
  if (auth?.refreshToken) {
    const body = new URLSearchParams({
      token: auth.refreshToken,
      client_id: aapConfig.clientId,
    });
    await fetch("/o/revoke_token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }).catch(() => {
      // ignore — even if revocation fails we still clear local state.
    });
  }
  tokenStore.clear();
  pkceStore.clear();
}
