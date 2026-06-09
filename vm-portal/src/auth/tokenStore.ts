/**
 * Persists OAuth tokens in sessionStorage (cleared on tab close).
 *
 * Not localStorage — refresh tokens are sensitive and we don't want them
 * sitting around across sessions on a shared machine.
 */

const TOKEN_KEY = "vm-portal:auth";
const PKCE_KEY = "vm-portal:pkce";

export interface StoredAuth {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when the access token stops being valid. */
  expiresAt: number;
  tokenType: string;
}

export interface PkceFlowState {
  codeVerifier: string;
  state: string;
  /** Path to navigate back to after the callback completes. */
  returnTo: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const tokenStore = {
  get(): StoredAuth | null {
    return readJson<StoredAuth>(TOKEN_KEY);
  },
  set(auth: StoredAuth): void {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
  },
  clear(): void {
    sessionStorage.removeItem(TOKEN_KEY);
  },
  /** True when the stored token is missing or within 30s of expiry. */
  isExpired(): boolean {
    const auth = this.get();
    if (!auth) return true;
    return Date.now() >= auth.expiresAt - 30_000;
  },
};

export const pkceStore = {
  get(): PkceFlowState | null {
    return readJson<PkceFlowState>(PKCE_KEY);
  },
  set(state: PkceFlowState): void {
    sessionStorage.setItem(PKCE_KEY, JSON.stringify(state));
  },
  clear(): void {
    sessionStorage.removeItem(PKCE_KEY);
  },
};
